/*
 * Copyright (C) 2017 Apple Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

WI.NetworkTableContentView = class NetworkTableContentView extends WI.ContentView
{
    constructor(representedObject, extraArguments)
    {
        super(representedObject);

        this._entries = [];
        this._entriesSortComparator = null;
        this._filteredEntries = [];
        this._pendingInsertions = [];
        this._pendingUpdates = [];
        this._pendingFilter = false;

        this._table = null;
        this._nameColumnWidthSetting = new WI.Setting("network-table-content-view-name-column-width", 250);

        this._selectedResource = null;
        this._resourceDetailView = null;
        this._resourceDetailViewMap = new Map;

        // FIXME: Network Timeline.
        // FIXME: Throttling.
        // FIXME: HAR Export.

        const exclusive = true;
        this._typeFilterScopeBarItemAll = new WI.ScopeBarItem("network-type-filter-all", WI.UIString("All"), exclusive);
        let typeFilterScopeBarItems = [this._typeFilterScopeBarItemAll];

        let uniqueTypes = [
            ["Document", (type) => type === WI.Resource.Type.Document],
            ["Stylesheet", (type) => type === WI.Resource.Type.Stylesheet],
            ["Image", (type) => type === WI.Resource.Type.Image],
            ["Font", (type) => type === WI.Resource.Type.Font],
            ["Script", (type) => type === WI.Resource.Type.Script],
            ["XHR", (type) => type === WI.Resource.Type.XHR || type === WI.Resource.Type.Fetch],
            ["Other", (type) => type === WI.Resource.Type.Other || type === WI.Resource.Type.WebSocket],
        ];
        for (let [key, checker] of uniqueTypes) {
            let type = WI.Resource.Type[key];
            let scopeBarItem = new WI.ScopeBarItem("network-type-filter-" + key, WI.NetworkTableContentView.shortDisplayNameForResourceType(type));
            scopeBarItem.__checker = checker;
            typeFilterScopeBarItems.push(scopeBarItem);
        }

        this._typeFilterScopeBar = new WI.ScopeBar("network-type-filter-scope-bar", typeFilterScopeBarItems, typeFilterScopeBarItems[0]);
        this._typeFilterScopeBar.addEventListener(WI.ScopeBar.Event.SelectionChanged, this._typeFilterScopeBarSelectionChanged, this);

        this._textFilterSearchId = 0;
        this._textFilterSearchText = null;
        this._textFilterIsActive = false;

        this._textFilterNavigationItem = new WI.FilterBarNavigationItem;
        this._textFilterNavigationItem.filterBar.incremental = false;
        this._textFilterNavigationItem.filterBar.addEventListener(WI.FilterBar.Event.FilterDidChange, this._textFilterDidChange, this);
        this._textFilterNavigationItem.filterBar.placeholder = WI.UIString("Filter Full URL and Text");

        this._activeTypeFilters = this._generateTypeFilter();
        this._activeTextFilterResources = new Set;

        this._emptyFilterResultsMessageElement = null;

        // COMPATIBILITY (iOS 10.3): Network.setDisableResourceCaching did not exist.
        if (window.NetworkAgent && NetworkAgent.setResourceCachingDisabled) {
            let toolTipForDisableResourceCache = WI.UIString("Ignore the resource cache when loading resources");
            let activatedToolTipForDisableResourceCache = WI.UIString("Use the resource cache when loading resources");
            this._disableResourceCacheNavigationItem = new WI.ActivateButtonNavigationItem("disable-resource-cache", toolTipForDisableResourceCache, activatedToolTipForDisableResourceCache, "Images/IgnoreCaches.svg", 16, 16);
            this._disableResourceCacheNavigationItem.activated = WI.resourceCachingDisabledSetting.value;

            this._disableResourceCacheNavigationItem.addEventListener(WI.ButtonNavigationItem.Event.Clicked, this._toggleDisableResourceCache, this);
            WI.resourceCachingDisabledSetting.addEventListener(WI.Setting.Event.Changed, this._resourceCachingDisabledSettingChanged, this);
        }

        this._clearNetworkItemsNavigationItem = new WI.ButtonNavigationItem("clear-network-items", WI.UIString("Clear Network Items (%s)").format(WI.clearKeyboardShortcut.displayName), "Images/NavigationItemTrash.svg", 15, 15);
        this._clearNetworkItemsNavigationItem.addEventListener(WI.ButtonNavigationItem.Event.Clicked, () => this.reset());

        WI.Frame.addEventListener(WI.Frame.Event.MainResourceDidChange, this._mainResourceDidChange, this);
        WI.Resource.addEventListener(WI.Resource.Event.LoadingDidFinish, this._resourceLoadingDidFinish, this);
        WI.Resource.addEventListener(WI.Resource.Event.LoadingDidFail, this._resourceLoadingDidFail, this);
        WI.Resource.addEventListener(WI.Resource.Event.TransferSizeDidChange, this._resourceTransferSizeDidChange, this);
        WI.frameResourceManager.addEventListener(WI.FrameResourceManager.Event.MainFrameDidChange, this._mainFrameDidChange, this);
        WI.timelineManager.persistentNetworkTimeline.addEventListener(WI.Timeline.Event.RecordAdded, this._networkTimelineRecordAdded, this);

        this._needsInitialPopulate = true;
    }

    // Static

    static shortDisplayNameForResourceType(type)
    {
        switch (type) {
        case WI.Resource.Type.Document:
            return WI.UIString("Document");
        case WI.Resource.Type.Stylesheet:
            return "CSS";
        case WI.Resource.Type.Image:
            return WI.UIString("Image");
        case WI.Resource.Type.Font:
            return WI.UIString("Font");
        case WI.Resource.Type.Script:
            return "JS";
        case WI.Resource.Type.XHR:
        case WI.Resource.Type.Fetch:
            return "XHR";
        case WI.Resource.Type.Ping:
            return WI.UIString("Ping");
        case WI.Resource.Type.Beacon:
            return WI.UIString("Beacon");
        case WI.Resource.Type.WebSocket:
        case WI.Resource.Type.Other:
            return WI.UIString("Other");
        default:
            console.error("Unknown resource type", type);
            return null;
        }
    }

    // Public

    get selectionPathComponents()
    {
        return null;
    }

    get navigationItems()
    {
        let items = [];
        if (this._disableResourceCacheNavigationItem)
            items.push(this._disableResourceCacheNavigationItem);
        items.push(this._clearNetworkItemsNavigationItem);
        return items;
    }

    get filterNavigationItems()
    {
        let items = [];
        if (window.PageAgent)
            items.push(this._textFilterNavigationItem);
        items.push(this._typeFilterScopeBar);
        return items;
    }

    shown()
    {
        super.shown();

        if (this._resourceDetailView)
            this._resourceDetailView.shown();

        if (this._table)
            this._table.restoreScrollPosition();
    }

    hidden()
    {
        if (this._resourceDetailView)
            this._resourceDetailView.hidden();

        super.hidden();
    }

    closed()
    {
        this._hideResourceDetailView();

        for (let detailView of this._resourceDetailViewMap.values())
            detailView.dispose();
        this._resourceDetailViewMap.clear();

        WI.Frame.removeEventListener(null, null, this);
        WI.Resource.removeEventListener(null, null, this);
        WI.frameResourceManager.removeEventListener(WI.FrameResourceManager.Event.MainFrameDidChange, this._mainFrameDidChange, this);
        WI.timelineManager.persistentNetworkTimeline.removeEventListener(WI.Timeline.Event.RecordAdded, this._networkTimelineRecordAdded, this);

        super.closed();
    }

    reset()
    {
        this._entries = [];
        this._filteredEntries = [];
        this._pendingInsertions = [];

        for (let detailView of this._resourceDetailViewMap.values())
            detailView.dispose();
        this._resourceDetailViewMap.clear();

        if (this._table) {
            this._hideResourceDetailView();
            this._selectedResource = null;
            this._table.clearSelectedRow();
            this._table.reloadData();
        }
    }

    // NetworkResourceDetailView delegate

    networkResourceDetailViewClose(resourceDetailView)
    {
        this._hideResourceDetailView();
        this._selectedResource = null;
        this._table.clearSelectedRow();
    }

    // Table dataSource

    tableNumberOfRows(table)
    {
        return this._filteredEntries.length;
    }

    tableSortChanged(table)
    {
        this._generateSortComparator();

        if (!this._entriesSortComparator)
            return;

        this._hideResourceDetailView();

        this._entries = this._entries.sort(this._entriesSortComparator);
        this._updateFilteredEntries();
        this._table.reloadData();
    }

    // Table delegate

    tableCellMouseDown(table, cell, column, rowIndex, event)
    {
        if (column !== this._nameColumn)
            return;

        this._table.selectRow(rowIndex);
    }

    tableCellContextMenuClicked(table, cell, column, rowIndex, event)
    {
        if (column !== this._nameColumn)
            return;

        this._table.selectRow(rowIndex);

        let entry = this._filteredEntries[rowIndex];
        let contextMenu = WI.ContextMenu.createFromEvent(event);
        WI.appendContextMenuItemsForSourceCode(contextMenu, entry.resource);
    }

    tableSelectedRowChanged(table, rowIndex)
    {
        if (isNaN(rowIndex)) {
            this._selectedResource = null;
            this._hideResourceDetailView();
            return;
        }

        let entry = this._filteredEntries[rowIndex];
        if (entry.resource === this._selectedResource)
            return;

        this._selectedResource = entry.resource;
        this._showResourceDetailView(this._selectedResource);
    }

    tablePopulateCell(table, cell, column, rowIndex)
    {
        let entry = this._filteredEntries[rowIndex];

        cell.classList.toggle("error", entry.resource.hadLoadingError());

        switch (column.identifier) {
        case "name":
            this._populateNameCell(cell, entry);
            break;
        case "domain":
            cell.textContent = entry.domain || emDash;
            break;
        case "type":
            cell.textContent = entry.displayType || emDash;
            break;
        case "mimeType":
            cell.textContent = entry.mimeType || emDash;
            break;
        case "method":
            cell.textContent = entry.method || emDash;
            break;
        case "scheme":
            cell.textContent = entry.scheme || emDash;
            break;
        case "status":
            cell.textContent = entry.status || emDash;
            break;
        case "protocol":
            cell.textContent = entry.protocol || emDash;
            break;
        case "priority":
            cell.textContent = WI.Resource.displayNameForPriority(entry.priority) || emDash;
            break;
        case "remoteAddress":
            cell.textContent = entry.remoteAddress || emDash;
            break;
        case "connectionIdentifier":
            cell.textContent = entry.connectionIdentifier || emDash;
            break;
        case "resourceSize":
            cell.textContent = isNaN(entry.resourceSize) ? emDash : Number.bytesToString(entry.resourceSize);
            break;
        case "transferSize":
            this._populateTransferSizeCell(cell, entry);
            break;
        case "time":
            // FIXME: <https://webkit.org/b/176748> Web Inspector: Frontend sometimes receives resources with negative duration (responseEnd - requestStart)
            cell.textContent = isNaN(entry.time) ? emDash : Number.secondsToString(Math.max(entry.time, 0));
            break;
        case "waterfall":
            // FIXME: Waterfall graph.
            cell.textContent = emDash;
            break;
        }

        return cell;
    }

    // Private

    _populateNameCell(cell, entry)
    {
        console.assert(!cell.firstChild, "We expect the cell to be empty.", cell, cell.firstChild);

        let resource = entry.resource;
        if (resource.isLoading()) {
            let statusElement = cell.appendChild(document.createElement("div"));
            statusElement.className = "status";
            let spinner = new WI.IndeterminateProgressSpinner;
            statusElement.appendChild(spinner.element);
        }

        let iconElement = cell.appendChild(document.createElement("img"));
        iconElement.className = "icon";
        cell.classList.add(WI.ResourceTreeElement.ResourceIconStyleClassName, entry.resource.type);

        let nameElement = cell.appendChild(document.createElement("span"));
        nameElement.textContent = entry.name;
    }

    _populateTransferSizeCell(cell, entry)
    {
        let responseSource = entry.resource.responseSource;
        if (responseSource === WI.Resource.ResponseSource.MemoryCache) {
            cell.classList.add("cache-type");
            cell.textContent = WI.UIString("(memory)");
            return;
        }
        if (responseSource === WI.Resource.ResponseSource.DiskCache) {
            cell.classList.add("cache-type");
            cell.textContent = WI.UIString("(disk)");
            return;
        }

        let transferSize = entry.transferSize;
        cell.textContent = isNaN(transferSize) ? emDash : Number.bytesToString(transferSize);
        console.assert(!cell.classList.contains("cache-type"), "Should not have cache-type class on cell.");
    }

    _generateSortComparator()
    {
        let sortColumnIdentifier = this._table.sortColumnIdentifier;
        if (!sortColumnIdentifier) {
            this._entriesSortComparator = null;
            return;
        }

        let comparator;

        switch (sortColumnIdentifier) {
        case "name":
        case "domain":
        case "mimeType":
        case "method":
        case "scheme":
        case "protocol":
        case "remoteAddress":
            // Simple string.
            comparator = (a, b) => (a[sortColumnIdentifier] || "").extendedLocaleCompare(b[sortColumnIdentifier] || "");
            break;

        case "status":
        case "connectionIdentifier":
        case "resourceSize":
        case "time":
            // Simple number.
            comparator = (a, b) => {
                let aValue = a[sortColumnIdentifier];
                if (isNaN(aValue))
                    return 1;
                let bValue = b[sortColumnIdentifier];
                if (isNaN(bValue))
                    return -1;
                return aValue - bValue;
            };
            break;

        case "priority":
            // Resource.NetworkPriority enum.
            comparator = (a, b) => WI.Resource.comparePriority(a.priority, b.priority);
            break;

        case "type":
            // Sort by displayType string.
            comparator = (a, b) => (a.displayType || "").extendedLocaleCompare(b.displayType || "");
            break;

        case "transferSize":
            // Handle (memory) and (disk) values.
            comparator = (a, b) => {
                let transferSizeA = a.transferSize;
                let transferSizeB = b.transferSize;

                // Treat NaN as the largest value.
                if (isNaN(transferSizeA))
                    return 1;
                if (isNaN(transferSizeB))
                    return -1;

                // Treat memory cache and disk cache as small values.
                let sourceA = a.resource.responseSource;
                if (sourceA === WI.Resource.ResponseSource.MemoryCache)
                    transferSizeA = -20;
                else if (sourceA === WI.Resource.ResponseSource.DiskCache)
                    transferSizeA = -10;

                let sourceB = b.resource.responseSource;
                if (sourceB === WI.Resource.ResponseSource.MemoryCache)
                    transferSizeB = -20;
                else if (sourceB === WI.Resource.ResponseSource.DiskCache)
                    transferSizeB = -10;

                return transferSizeA - transferSizeB;
            };
            break;

        case "waterfall":
            // Sort by startTime number.
            comparator = comparator = (a, b) => a.startTime - b.startTime;
            break;

        default:
            console.assert("Unexpected sort column", sortColumnIdentifier);
            return;
        }

        let reverseFactor = this._table.sortOrder === WI.Table.SortOrder.Ascending ? 1 : -1;
        this._entriesSortComparator = (a, b) => reverseFactor * comparator(a, b);
    }

    // Protected

    initialLayout()
    {
        this._nameColumn = new WI.TableColumn("name", WI.UIString("Name"), {
            minWidth: WI.Sidebar.AbsoluteMinimumWidth,
            maxWidth: 500,
            initialWidth: this._nameColumnWidthSetting.value,
            resizeType: WI.TableColumn.ResizeType.Locked,
        });

        this._nameColumn.addEventListener(WI.TableColumn.Event.WidthDidChange, this._tableNameColumnDidChangeWidth, this);

        this._domainColumn = new WI.TableColumn("domain", WI.UIString("Domain"), {
            minWidth: 120,
            maxWidth: 200,
            initialWidth: 150,
        });

        this._typeColumn = new WI.TableColumn("type", WI.UIString("Type"), {
            minWidth: 70,
            maxWidth: 120,
            initialWidth: 90,
        });

        this._mimeTypeColumn = new WI.TableColumn("mimeType", WI.UIString("MIME Type"), {
            hidden: true,
            minWidth: 100,
            maxWidth: 150,
            initialWidth: 120,
        });

        this._methodColumn = new WI.TableColumn("method", WI.UIString("Method"), {
            hidden: true,
            minWidth: 55,
            maxWidth: 80,
            initialWidth: 65,
        });

        this._schemeColumn = new WI.TableColumn("scheme", WI.UIString("Scheme"), {
            hidden: true,
            minWidth: 55,
            maxWidth: 80,
            initialWidth: 65,
        });

        this._statusColumn = new WI.TableColumn("status", WI.UIString("Status"), {
            hidden: true,
            minWidth: 50,
            maxWidth: 50,
            align: "left",
        });

        this._protocolColumn = new WI.TableColumn("protocol", WI.UIString("Protocol"), {
            hidden: true,
            minWidth: 65,
            maxWidth: 80,
            initialWidth: 75,
        });

        this._priorityColumn = new WI.TableColumn("priority", WI.UIString("Priority"), {
            hidden: true,
            minWidth: 65,
            maxWidth: 80,
            initialWidth: 70,
        });

        this._remoteAddressColumn = new WI.TableColumn("remoteAddress", WI.UIString("IP Address"), {
            hidden: true,
            minWidth: 150,
        });

        this._connectionIdentifierColumn = new WI.TableColumn("connectionIdentifier", WI.UIString("Connection ID"), {
            hidden: true,
            minWidth: 50,
            maxWidth: 120,
            initialWidth: 80,
            align: "right",
        });

        this._resourceSizeColumn = new WI.TableColumn("resourceSize", WI.UIString("Resource Size"), {
            hidden: true,
            minWidth: 80,
            maxWidth: 100,
            initialWidth: 80,
            align: "right",
        });

        this._transferSizeColumn = new WI.TableColumn("transferSize", WI.UIString("Transfer Size"), {
            minWidth: 100,
            maxWidth: 150,
            initialWidth: 100,
            align: "right",
        });

        this._timeColumn = new WI.TableColumn("time", WI.UIString("Time"), {
            minWidth: 65,
            maxWidth: 90,
            initialWidth: 65,
            align: "right",
        });

        this._waterfallColumn = new WI.TableColumn("waterfall", WI.UIString("Waterfall"), {
            minWidth: 230,
        });

        this._table = new WI.Table("network-table", this, this, 20);

        this._table.addColumn(this._nameColumn);
        this._table.addColumn(this._domainColumn);
        this._table.addColumn(this._typeColumn);
        this._table.addColumn(this._mimeTypeColumn);
        this._table.addColumn(this._methodColumn);
        this._table.addColumn(this._schemeColumn);
        this._table.addColumn(this._statusColumn);
        this._table.addColumn(this._protocolColumn);
        this._table.addColumn(this._priorityColumn);
        this._table.addColumn(this._remoteAddressColumn);
        this._table.addColumn(this._connectionIdentifierColumn);
        this._table.addColumn(this._resourceSizeColumn);
        this._table.addColumn(this._transferSizeColumn);
        this._table.addColumn(this._timeColumn);
        this._table.addColumn(this._waterfallColumn);

        if (!this._table.sortColumnIdentifier) {
            this._table.sortOrder = WI.Table.SortOrder.Ascending;
            this._table.sortColumnIdentifier = "waterfall";
        }

        this.addSubview(this._table);
    }

    layout()
    {
        this._processPendingEntries();
        this._positionDetailView();
        this._positionEmptyFilterMessage();
    }

    handleClearShortcut(event)
    {
        this.reset();
    }

    // Private

    _processPendingEntries()
    {
        let needsSort = this._pendingUpdates.length > 0;
        let needsFilter = this._pendingFilter;

        // No global sort or filter is needed, so just insert new records into their sorted position.
        if (!needsSort && !needsFilter) {
            let originalLength = this._pendingInsertions.length;
            for (let resource of this._pendingInsertions)
                this._insertResourceAndReloadTable(resource);
            console.assert(this._pendingInsertions.length === originalLength);
            this._pendingInsertions = [];
            return;
        }

        for (let resource of this._pendingInsertions)
            this._entries.push(this._entryForResource(resource));
        this._pendingInsertions = [];

        for (let resource of this._pendingUpdates)
            this._updateEntryForResource(resource);
        this._pendingUpdates = [];

        this._pendingFilter = false;

        this._updateSortAndFilteredEntries();
        this._table.reloadData();
    }

    _populateWithInitialResourcesIfNeeded()
    {
        if (!this._needsInitialPopulate)
            return;

        this._needsInitialPopulate = false;

        console.assert(WI.frameResourceManager.mainFrame);

        let populateFrameResources = (frame) => {
            if (frame.provisionalMainResource)
                this._pendingInsertions.push(frame.provisionalMainResource);
            else if (frame.mainResource)
                this._pendingInsertions.push(frame.mainResource);

            for (let resource of frame.resourceCollection.items)
                this._pendingInsertions.push(resource);

            for (let childFrame of frame.childFrameCollection.items)
                populateFrameResources(childFrame);
        };

        populateFrameResources(WI.frameResourceManager.mainFrame);

        this.needsLayout();
    }

    _checkTextFilterAgainstFinishedResource(resource)
    {
        let frame = resource.parentFrame;
        if (!frame)
            return;

        let searchQuery = this._textFilterSearchText;
        if (resource.url.includes(searchQuery)) {
            this._activeTextFilterResources.add(resource);
            return;
        }

        let searchId = this._textFilterSearchId;

        const isCaseSensitive = true;
        const isRegex = false;
        PageAgent.searchInResource(frame.id, resource.url, searchQuery, isCaseSensitive, isRegex, resource.requestIdentifier, (error, searchResults) => {
            if (searchId !== this._textFilterSearchId)
                return;

            if (error || !searchResults || !searchResults.length)
                return;

            this._activeTextFilterResources.add(resource);

            this._pendingFilter = true;
            this.needsLayout();
        });
    }

    _checkTextFilterAgainstFailedResource(resource)
    {
        let searchQuery = this._textFilterSearchText;
        if (resource.url.includes(searchQuery))
            this._activeTextFilterResources.add(resource);
    }

    _rowIndexForResource(resource)
    {
        return this._filteredEntries.findIndex((x) => x.resource === resource);
    }

    _updateEntryForResource(resource)
    {
        let index = this._entries.findIndex((x) => x.resource === resource);
        if (index === -1)
            return;

        let entry = this._entryForResource(resource);
        this._entries[index] = entry;

        let rowIndex = this._rowIndexForResource(resource);
        if (rowIndex === -1)
            return;

        this._filteredEntries[rowIndex] = entry;
    }

    _hideResourceDetailView()
    {
        if (!this._resourceDetailView)
            return;

        this.element.classList.remove("showing-detail");
        this._table.scrollContainer.style.removeProperty("width");

        this.removeSubview(this._resourceDetailView);

        this._resourceDetailView.hidden();
        this._resourceDetailView = null;

        this._table.resize();
    }

    _showResourceDetailView(resource)
    {
        let oldResourceDetailView = this._resourceDetailView;

        this._resourceDetailView = this._resourceDetailViewMap.get(resource);
        if (!this._resourceDetailView) {
            this._resourceDetailView = new WI.NetworkResourceDetailView(resource, this);
            this._resourceDetailViewMap.set(resource, this._resourceDetailView);
        }

        if (oldResourceDetailView) {
            oldResourceDetailView.hidden();
            this.replaceSubview(oldResourceDetailView, this._resourceDetailView);
        } else
            this.addSubview(this._resourceDetailView);
        this._resourceDetailView.shown();

        this.element.classList.add("showing-detail");
        this._table.scrollContainer.style.width = this._nameColumn.width + "px";

        // FIXME: It would be nice to avoid this.
        // Currently the ResourceDetailView is in the heirarchy but has not yet done a layout so we
        // end up seeing the table behind it. This forces us to layout now instead of after a beat.
        this.updateLayout();
    }

    _positionDetailView()
    {
        if (!this._resourceDetailView)
            return;

        let side = WI.resolvedLayoutDirection() === WI.LayoutDirection.RTL ? "right" : "left";
        this._resourceDetailView.element.style[side] = this._nameColumn.width + "px";
        this._table.scrollContainer.style.width = this._nameColumn.width + "px";
    }

    _updateTextFilterActiveIndicator()
    {
        this._textFilterNavigationItem.filterBar.indicatingActive = this._hasTextFilter();
    }

    _updateEmptyFilterResultsMessage()
    {
        if (this._hasActiveFilter() && !this._filteredEntries.length)
            this._showEmptyFilterResultsMessage();
        else
            this._hideEmptyFilterResultsMessage();
    }

    _showEmptyFilterResultsMessage()
    {
        if (!this._emptyFilterResultsMessageElement) {
            let message = WI.UIString("No Filter Results");
            let buttonElement = document.createElement("button");
            buttonElement.textContent = WI.UIString("Clear filters");
            buttonElement.addEventListener("click", () => { this._resetFilters(); });

            this._emptyFilterResultsMessageElement = document.createElement("div");
            this._emptyFilterResultsMessageElement.className = "empty-content-placeholder";

            let messageElement = this._emptyFilterResultsMessageElement.appendChild(document.createElement("div"));
            messageElement.className = "message";
            messageElement.append(message, document.createElement("br"), buttonElement);
        }

        this.element.appendChild(this._emptyFilterResultsMessageElement);
        this._positionEmptyFilterMessage();
    }

    _hideEmptyFilterResultsMessage()
    {
        if (!this._emptyFilterResultsMessageElement)
            return;

        this._emptyFilterResultsMessageElement.remove();
    }

    _positionEmptyFilterMessage()
    {
        if (!this._emptyFilterResultsMessageElement)
            return;

        let width = this._nameColumn.width - 1; // For the 1px border.
        this._emptyFilterResultsMessageElement.style.width = width + "px";
    }

    _resourceCachingDisabledSettingChanged()
    {
        this._disableResourceCacheNavigationItem.activated = WI.resourceCachingDisabledSetting.value;
    }

    _toggleDisableResourceCache()
    {
        WI.resourceCachingDisabledSetting.value = !WI.resourceCachingDisabledSetting.value;
    }

    _mainResourceDidChange(event)
    {
        let frame = event.target;
        if (!frame.isMainFrame() || !WI.settings.clearNetworkOnNavigate.value)
            return;

        this.reset();

        this._insertResourceAndReloadTable(frame.mainResource);
    }

    _mainFrameDidChange()
    {
        this._populateWithInitialResourcesIfNeeded();
    }

    _resourceLoadingDidFinish(event)
    {
        let resource = event.target;
        this._pendingUpdates.push(resource);

        if (this._hasTextFilter())
            this._checkTextFilterAgainstFinishedResource(resource);

        this.needsLayout();
    }

    _resourceLoadingDidFail(event)
    {
        let resource = event.target;
        this._pendingUpdates.push(resource);

        if (this._hasTextFilter())
            this._checkTextFilterAgainstFailedResource(resource);

        this.needsLayout();
    }

    _resourceTransferSizeDidChange(event)
    {
        if (!this._table)
            return;

        let resource = event.target;

        // In the unlikely event that this is the sort column, we may need to resort.
        if (this._table.sortColumnIdentifier === "transferSize") {
            this._pendingUpdates.push(resource);
            this.needsLayout();
            return;
        }

        let index = this._entries.findIndex((x) => x.resource === resource);
        if (index === -1)
            return;

        let entry = this._entries[index];
        entry.transferSize = !isNaN(resource.networkTotalTransferSize) ? resource.networkTotalTransferSize : resource.estimatedTotalTransferSize;

        let rowIndex = this._rowIndexForResource(resource);
        if (rowIndex === -1)
            return;

        this._table.reloadCell(rowIndex, "transferSize");
    }

    _networkTimelineRecordAdded(event)
    {
        let resourceTimelineRecord = event.data.record;
        console.assert(resourceTimelineRecord instanceof WI.ResourceTimelineRecord);

        let resource = resourceTimelineRecord.resource;
        this._insertResourceAndReloadTable(resource);
    }

    _isDefaultSort()
    {
        return this._table.sortColumnIdentifier === "waterfall" && this._table.sortOrder === WI.Table.SortOrder.Ascending;
    }

    _insertResourceAndReloadTable(resource)
    {
        if (!this._table || !(WI.tabBrowser.selectedTabContentView instanceof WI.NetworkTabContentView)) {
            this._pendingInsertions.push(resource);
            this.needsLayout();
            return;
        }

        let entry = this._entryForResource(resource);

        // Default sort has fast path.
        if (this._isDefaultSort() || !this._entriesSortComparator) {
            this._entries.push(entry);
            if (this._passFilter(entry)) {
                this._filteredEntries.push(entry);
                this._table.reloadDataAddedToEndOnly();
            }
            return;
        }

        insertObjectIntoSortedArray(entry, this._entries, this._entriesSortComparator);

        if (this._passFilter(entry)) {
            insertObjectIntoSortedArray(entry, this._filteredEntries, this._entriesSortComparator);

            // Probably a useless optimization here, but if we only added this row to the end
            // we may avoid recreating all visible rows by saying as such.
            if (this._filteredEntries.lastValue === entry)
                this._table.reloadDataAddedToEndOnly();
            else
                this._table.reloadData();
        }
    }

    _displayType(resource)
    {
        if (resource.type === WI.Resource.Type.Image || resource.type === WI.Resource.Type.Font) {
            let fileExtension;
            if (resource.mimeType)
                fileExtension = WI.fileExtensionForMIMEType(resource.mimeType);
            if (!fileExtension)
                fileExtension = WI.fileExtensionForURL(resource.url);
            if (fileExtension)
                return fileExtension;
        }

        return WI.NetworkTableContentView.shortDisplayNameForResourceType(resource.type).toLowerCase();
    }

    _entryForResource(resource)
    {
        // FIXME: <https://webkit.org/b/143632> Web Inspector: Resources with the same name in different folders aren't distinguished
        // FIXME: <https://webkit.org/b/176765> Web Inspector: Resource names should be less ambiguous

        return {
            resource,
            name: WI.displayNameForURL(resource.url, resource.urlComponents),
            domain: WI.displayNameForHost(resource.urlComponents.host),
            scheme: resource.urlComponents.scheme ? resource.urlComponents.scheme.toLowerCase() : "",
            method: resource.requestMethod,
            type: resource.type,
            displayType: this._displayType(resource),
            mimeType: resource.mimeType,
            status: resource.statusCode,
            cached: resource.cached,
            resourceSize: resource.size,
            transferSize: !isNaN(resource.networkTotalTransferSize) ? resource.networkTotalTransferSize : resource.estimatedTotalTransferSize,
            time: resource.duration,
            protocol: resource.protocol,
            priority: resource.priority,
            remoteAddress: resource.remoteAddress,
            connectionIdentifier: resource.connectionIdentifier,
            startTime: resource.firstTimestamp,
        };
    }

    _hasTypeFilter()
    {
        return !!this._activeTypeFilters;
    }

    _hasTextFilter()
    {
        return this._textFilterIsActive;
    }

    _hasActiveFilter()
    {
        return this._hasTypeFilter()
            || this._hasTextFilter();
    }

    _passTypeFilter(entry)
    {
        if (!this._hasTypeFilter())
            return true;
        return this._activeTypeFilters.some((checker) => checker(entry.resource.type));
    }

    _passTextFilter(entry)
    {
        if (!this._hasTextFilter())
            return true;
        return this._activeTextFilterResources.has(entry.resource);
    }

    _passFilter(entry)
    {
        return this._passTypeFilter(entry)
            && this._passTextFilter(entry);
    }

    _updateSortAndFilteredEntries()
    {
        this._entries = this._entries.sort(this._entriesSortComparator);
        this._updateFilteredEntries();
    }

    _updateFilteredEntries()
    {
        if (this._hasActiveFilter())
            this._filteredEntries = this._entries.filter(this._passFilter, this);
        else
            this._filteredEntries = this._entries.slice();

        this._restoreSelectedRow();

        this._updateTextFilterActiveIndicator();
        this._updateEmptyFilterResultsMessage();
    }

    _generateTypeFilter()
    {
        let selectedItems = this._typeFilterScopeBar.selectedItems;
        if (!selectedItems.length || selectedItems.includes(this._typeFilterScopeBarItemAll))
            return null;

        return selectedItems.map((item) => item.__checker);
    }

    _resetFilters()
    {
        console.assert(this._hasActiveFilter());

        // Clear text filter.
        this._textFilterSearchId++;
        this._textFilterNavigationItem.filterBar.indicatingProgress = false;
        this._textFilterSearchText = null;
        this._textFilterIsActive = false;
        this._activeTextFilterResources.clear();
        this._textFilterNavigationItem.filterBar.clear();
        console.assert(!this._hasTextFilter());

        // Clear type filter.
        this._typeFilterScopeBar.resetToDefault();
        console.assert(!this._hasTypeFilter());

        console.assert(!this._hasActiveFilter());

        this._updateFilteredEntries();
        this._table.reloadData();
    }

    _areFilterListsIdentical(listA, listB)
    {
        if (listA && listB) {
            if (listA.length !== listB.length)
                return false;

            for (let i = 0; i < listA.length; ++i) {
                if (listA[i] !== listB[i])
                    return false;
            }

            return true;
        }

        return false;
    }

    _typeFilterScopeBarSelectionChanged(event)
    {
        // FIXME: <https://webkit.org/b/176763> Web Inspector: ScopeBar SelectionChanged event may dispatch multiple times for a single logical change
        // We can't use shallow equals here because the contents are functions.
        let oldFilter = this._activeTypeFilters;
        let newFilter = this._generateTypeFilter();
        if (this._areFilterListsIdentical(oldFilter, newFilter))
            return;

        // Even if the selected resource would still be visible, lets close the detail view if a filter changes.
        this._hideResourceDetailView();

        this._activeTypeFilters = newFilter;
        this._updateFilteredEntries();
        this._table.reloadData();
    }

    _textFilterDidChange(event)
    {
        let searchQuery = this._textFilterNavigationItem.filterBar.filters.text;
        if (searchQuery === this._textFilterSearchText)
            return;

        // Even if the selected resource would still be visible, lets close the detail view if a filter changes.
        this._hideResourceDetailView();

        let searchId = ++this._textFilterSearchId;

        // Search cleared.
        if (!searchQuery) {
            this._textFilterNavigationItem.filterBar.indicatingProgress = false;
            this._textFilterSearchText = null;
            this._textFilterIsActive = false;
            this._activeTextFilterResources.clear();

            this._updateFilteredEntries();
            this._table.reloadData();
            return;
        }

        this._textFilterSearchText = searchQuery;
        this._textFilterNavigationItem.filterBar.indicatingProgress = true;

        // NetworkTable text filter currently searches:
        //   - Resource URL
        //   - Resource Text Content
        // It does not search all the content in the table (like mimeType, headers, etc).
        // For those we should provide more custom filters.

        const isCaseSensitive = true;
        const isRegex = false;
        PageAgent.searchInResources(searchQuery, isCaseSensitive, isRegex, (error, searchResults) => {
            if (searchId !== this._textFilterSearchId)
                return;

            this._textFilterIsActive = true;
            this._activeTextFilterResources.clear();
            this._textFilterNavigationItem.filterBar.indicatingProgress = false;

            // Add resources based on URL.
            for (let entry of this._entries) {
                let resource = entry.resource;
                if (resource.url.includes(searchQuery))
                    this._activeTextFilterResources.add(resource);
            }

            // Add resources based on content.
            if (!error) {
                for (let {url, frameId, requestId} of searchResults) {
                    if (requestId) {
                        let resource = WI.frameResourceManager.resourceForRequestIdentifier(requestId);
                        if (resource) {
                            this._activeTextFilterResources.add(resource);
                            continue;
                        }
                    }

                    if (frameId && url) {
                        let frame = WI.frameResourceManager.frameForIdentifier(frameId);
                        if (frame) {
                            if (frame.mainResource.url === url) {
                                this._activeTextFilterResources.add(frame.mainResource);
                                continue;
                            }
                            let resource = frame.resourceForURL(url);
                            if (resource) {
                                this._activeTextFilterResources.add(resource);
                                continue;
                            }
                        }
                    }
                }
            }

            // Apply.
            this._updateFilteredEntries();
            this._table.reloadData();
        });
    }

    _restoreSelectedRow()
    {
        if (!this._selectedResource)
            return;

        let rowIndex = this._rowIndexForResource(this._selectedResource);
        if (rowIndex === -1) {
            this._selectedResource = null;
            this._table.clearSelectedRow();
            return;
        }

        this._table.selectRow(rowIndex);
    }

    _tableNameColumnDidChangeWidth(event)
    {
        this._nameColumnWidthSetting.value = event.target.width;

        this._positionDetailView();
        this._positionEmptyFilterMessage();
    }
};
