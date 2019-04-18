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

WI.RecordingNavigationSidebarPanel = class RecordingNavigationSidebarPanel extends WI.NavigationSidebarPanel
{
    constructor()
    {
        super("recording", WI.UIString("Recording"));

        this.contentTreeOutline.customIndent = true;
        this.contentTreeOutline.registerScrollVirtualizer(this.contentView.element, 20);

        this.recording = null;

        this._importButton = null;
        this._exportButton = null;
    }

    // Static

    static disallowInstanceForClass()
    {
        return true;
    }

    // Public

    set recording(recording)
    {
        if (recording === this._recording)
            return;

        this.contentTreeOutline.removeChildren();

        this._recording = recording;

        this.updateEmptyContentPlaceholder(WI.UIString("No Recording Data"));

        if (!this._recording) {
            if (this._exportButton)
                this._exportButton.disabled = true;
            return;
        }

        this._recording.actions.then((actions) => {
            this.contentTreeOutline.element.dataset.indent = Number.countDigits(actions.length);

            if (actions[0] instanceof WI.RecordingInitialStateAction)
                this.contentTreeOutline.appendChild(new WI.RecordingActionTreeElement(actions[0], 0, this._recording.type));

            let cumulativeActionIndex = 1;
            this._recording.frames.forEach((frame, frameIndex) => {
                let folder = new WI.FolderTreeElement(WI.UIString("Frame %d").format((frameIndex + 1).toLocaleString()));
                this.contentTreeOutline.appendChild(folder);

                for (let i = 0; i < frame.actions.length; ++i)
                    folder.appendChild(new WI.RecordingActionTreeElement(frame.actions[i], cumulativeActionIndex + i, this._recording.type));

                if (frame.incomplete)
                    folder.subtitle = WI.UIString("Incomplete");

                if (this._recording.frames.length === 1)
                    folder.expand();

                cumulativeActionIndex += frame.actions.length;
            });

            this._exportButton.disabled = !actions.length;
        });
    }

    updateActionIndex(index, options = {})
    {
        if (!this._recording)
            return;

        this._recording.actions.then((actions) => {
            console.assert(index >= 0 && index < actions.length);
            if (index < 0 || index >= actions.length)
                return;

            let treeOutline = this.contentTreeOutline;
            if (!(actions[0] instanceof WI.RecordingInitialStateAction) || index) {
                treeOutline = treeOutline.children[0];
                while (index > treeOutline.children.length) {
                    index -= treeOutline.children.length;
                    treeOutline = treeOutline.nextSibling;
                }

                // Must subtract one from the final result since the initial state is considered index 0.
                --index;
            }

            let treeElementToSelect = treeOutline.children[index];
            if (treeElementToSelect.parent && !treeElementToSelect.parent.expanded)
                treeElementToSelect = treeElementToSelect.parent;

            const omitFocus = false;
            const selectedByUser = false;
            let suppressOnSelect = !(treeElementToSelect instanceof WI.FolderTreeElement);
            const suppressOnDeselect = true;
            treeElementToSelect.revealAndSelect(omitFocus, selectedByUser, suppressOnSelect, suppressOnDeselect);
        });
    }

    // Protected

    initialLayout()
    {
        super.initialLayout();

        const role = "button";

        const importLabel = WI.UIString("Import");
        let importNavigationItem = new WI.NavigationItem("recording-import", role, importLabel);

        this._importButton = importNavigationItem.element.appendChild(document.createElement("button"));
        this._importButton.textContent = importLabel;
        this._importButton.addEventListener("click", this._importNavigationItemClicked.bind(this));

        const exportLabel = WI.UIString("Export");
        let exportNavigationItem = new WI.NavigationItem("recording-export", role, exportLabel);

        this._exportButton = exportNavigationItem.element.appendChild(document.createElement("button"));
        this._exportButton.textContent = exportLabel;
        this._exportButton.disabled = !this.contentTreeOutline.children.length;
        this._exportButton.addEventListener("click", this._exportNavigationItemClicked.bind(this));

        const element = null;
        this.addSubview(new WI.NavigationBar(element, [importNavigationItem, exportNavigationItem]));

        let filterFunction = (treeElement) => {
            if (!(treeElement instanceof WI.RecordingActionTreeElement))
                return false;

            return treeElement.representedObject.isVisual;
        };

        const activatedByDefault = false;
        const defaultToolTip = WI.UIString("Only show visual actions");
        const activatedToolTip = WI.UIString("Show all actions");
        this.filterBar.addFilterBarButton("recording-show-visual-only", filterFunction, activatedByDefault, defaultToolTip, activatedToolTip, "Images/Paint.svg", 15, 15);
    }

    matchTreeElementAgainstCustomFilters(treeElement)
    {
        // Keep recording frame tree elements.
        if (treeElement instanceof WI.FolderTreeElement)
            return true;

        return super.matchTreeElementAgainstCustomFilters(treeElement);
    }

    // Private

    _importNavigationItemClicked(event)
    {
        WI.loadDataFromFile((data, filename) => {
            if (!data)
                return;

            let payload = null;
            try {
                payload = JSON.parse(data);
            } catch (e) {
                WI.Recording.synthesizeError(e);
                return;
            }

            this.dispatchEventToListeners(WI.RecordingNavigationSidebarPanel.Event.Import, {payload, filename});
        });
    }

    _exportNavigationItemClicked(event)
    {
        if (!this._recording || !this.contentBrowser || !this.contentBrowser.currentContentView || !this.contentBrowser.currentContentView.supportsSave)
            return;

        const forceSaveAs = true;
        WI.saveDataToFile(this.contentBrowser.currentContentView.saveData, forceSaveAs);
    }
};

WI.RecordingNavigationSidebarPanel.Event = {
    Import: "recording-navigation-sidebar-panel-import",
};
