class CustomAnalysisTaskConfigurator extends ComponentBase {

    constructor()
    {
        super('custom-analysis-task-configurator');

        this._selectedTests = [];
        this._triggerablePlatforms = [];
        this._selectedPlatform = null;
        this._configurationNames = ['Baseline', 'Comparison'];
        this._showComparison = false;
        this._commitSetMap = {};
        this._specifiedRevisions = {'Baseline': new Map, 'Comparison': new Map};
        this._patchUploaders = {'Baseline': new Map, 'Comparison': new Map};
        this._customRootUploaders = {'Baseline': null, 'Comparison': null};
        this._fetchedRevisions = {'Baseline': new Map, 'Comparison': new Map};
        this._repositoryGroupByConfiguration = {'Baseline': null, 'Comparison': null};
        this._updateTriggerableLazily = new LazilyEvaluatedFunction(this._updateTriggerable.bind(this));

        this._renderTriggerableTestsLazily = new LazilyEvaluatedFunction(this._renderTriggerableTests.bind(this));
        this._renderTriggerablePlatformsLazily = new LazilyEvaluatedFunction(this._renderTriggerablePlatforms.bind(this));
        this._renderRepositoryPanesLazily = new LazilyEvaluatedFunction(this._renderRepositoryPanes.bind(this));
    }

    tests() { return this._selectedTests; }
    platform() { return this._selectedPlatform; }
    commitSets()
    {
        const map = this._commitSetMap;
        if (!map['Baseline'] || !map['Comparison'])
            return null;
        return [map['Baseline'], map['Comparison']];
    }

    selectTests(selectedTests)
    {
        this._selectedTests = selectedTests;

        this._triggerablePlatforms = Triggerable.triggerablePlatformsForTests(this._selectedTests);
        if (this._selectedTests.length && !this._triggerablePlatforms.includes(this._selectedPlatform))
            this._selectedPlatform = null;

        this.enqueueToRender();
    }

    selectPlatform(selectedPlatform)
    {
        this._selectedPlatform = selectedPlatform;

        const [triggerable, error] = this._updateTriggerableLazily.evaluate(this._selectedTests, this._selectedPlatform);
        this._updateRepositoryGroups(triggerable);
        this._updateCommitSetMap();

        this.enqueueToRender();
    }

    setCommitSets(baselineCommitSet, comparisonCommitSet)
    {
        const [triggerable, error] = this._updateTriggerableLazily.evaluate(this._selectedTests, this._selectedPlatform);

        if (!triggerable)
            return;

        const baselineRepositoryGroup = triggerable.repositoryGroups().find((repositoryGroup) => repositoryGroup.accepts(baselineCommitSet));
        if (baselineRepositoryGroup) {
            this._repositoryGroupByConfiguration['Baseline'] = baselineRepositoryGroup;
            this._setUploadedFilesToUploader(this._customRootUploaders['Baseline'], baselineCommitSet.customRoots());
            this._specifiedRevisions['Baseline'] = this._revisionMapFromCommitSet(baselineCommitSet);
            this._setPatchFiles('Baseline', baselineCommitSet);
        }

        const comparisonRepositoryGroup = triggerable.repositoryGroups().find((repositoryGroup) => repositoryGroup.accepts(baselineCommitSet));
        if (comparisonRepositoryGroup) {
            this._repositoryGroupByConfiguration['Comparison'] = comparisonRepositoryGroup;
            this._setUploadedFilesToUploader(this._customRootUploaders['Comparison'], comparisonCommitSet.customRoots());
            this._specifiedRevisions['Comparison'] = this._revisionMapFromCommitSet(comparisonCommitSet);
            this._setPatchFiles('Comparison', comparisonCommitSet);
        }

        this._showComparison = true;
        this._updateCommitSetMap();
    }

    _setUploadedFilesToUploader(uploader, files)
    {
        if (!uploader || uploader.hasFileToUpload() || uploader.uploadedFiles().length)
            return;
        uploader.clearUploads();
        for (const uploadedFile of files)
            uploader.addUploadedFile(uploadedFile);
    }

    _setPatchFiles(configurationName, commitSet)
    {
        for (const repository of commitSet.repositories()) {
            const patch = commitSet.patchForRepository(repository);
            if (patch)
                this._setUploadedFilesToUploader(this._ensurePatchUploader(configurationName, repository), [patch]);
        }
    }

    _revisionMapFromCommitSet(commitSet)
    {
        const revisionMap = new Map;
        for (const repository of commitSet.repositories())
            revisionMap.set(repository, commitSet.revisionForRepository(repository));
        return revisionMap;
    }

    didConstructShadowTree()
    {
        this.content('specify-comparison-button').onclick = this.createEventHandler(() => this._configureComparison());

        const createRootUploader = () => {
            const uploader = new InstantFileUploader;
            uploader.allowMultipleFiles();
            uploader.element().textContent = 'Add a new root';
            uploader.listenToAction('removedFile', () => this._updateCommitSetMap());
            return uploader;
        }

        const baselineRootsUploader = createRootUploader();
        baselineRootsUploader.listenToAction('uploadedFile', (uploadedFile) => this._updateCommitSetMap());
        this._customRootUploaders['Baseline'] = baselineRootsUploader;

        const comparisonRootsUploader = createRootUploader();
        comparisonRootsUploader.listenToAction('uploadedFile', () => this._updateCommitSetMap());
        this._customRootUploaders['Comparison'] = comparisonRootsUploader;
    }

    _ensurePatchUploader(configurationName, repository)
    {
        const uploaderMap = this._patchUploaders[configurationName];
        let uploader = uploaderMap.get(repository);
        if (uploader)
            return uploader;

        uploader = new InstantFileUploader;
        uploader.element().textContent = 'Apply a patch';
        uploader.listenToAction('uploadedFile', () => this._updateCommitSetMap());
        uploader.listenToAction('removedFile', () => this._updateCommitSetMap());
        uploaderMap.set(repository, uploader);

        return uploader;
    }

    _configureComparison()
    {
        this._showComparison = true;
        this._repositoryGroupByConfiguration['Comparison'] = this._repositoryGroupByConfiguration['Baseline'];

        const specifiedBaselineRevisions = this._specifiedRevisions['Baseline'];
        const specifiedComparisonRevisions = new Map;
        for (let key of specifiedBaselineRevisions.keys())
            specifiedComparisonRevisions.set(key, specifiedBaselineRevisions.get(key));
        this._specifiedRevisions['Comparison'] = specifiedComparisonRevisions;

        for (const [repository, patchUploader] of this._patchUploaders['Baseline']) {
            const files = patchUploader.uploadedFiles();
            if (!files.length)
                continue;
            const comparisonPatchUploader = this._ensurePatchUploader('Comparison', repository);
            for (const uploadedFile of files)
                comparisonPatchUploader.addUploadedFile(uploadedFile);
        }

        const comparisonRootUploader = this._customRootUploaders['Comparison'];
        for (const uploadedFile of this._customRootUploaders['Baseline'].uploadedFiles())
            comparisonRootUploader.addUploadedFile(uploadedFile);

        this.enqueueToRender();
    }

    render()
    {
        super.render();

        const updateSelectedTestsLazily = this._renderTriggerableTestsLazily.evaluate();
        updateSelectedTestsLazily.evaluate(...this._selectedTests);
        const updateSelectedPlatformsLazily = this._renderTriggerablePlatformsLazily.evaluate(this._selectedTests, this._triggerablePlatforms);
        if (updateSelectedPlatformsLazily)
            updateSelectedPlatformsLazily.evaluate(this._selectedPlatform);

        const [triggerable, error] = this._updateTriggerableLazily.evaluate(this._selectedTests, this._selectedPlatform);

        this._renderRepositoryPanesLazily.evaluate(triggerable, error, this._selectedPlatform, this._repositoryGroupByConfiguration, this._showComparison);
    }

    _renderTriggerableTests()
    {
        const enabledTriggerables = Triggerable.all().filter((triggerable) => !triggerable.isDisabled());

        let tests = Test.topLevelTests().filter((test) => test.metrics().length && enabledTriggerables.some((triggerable) => triggerable.acceptsTest(test)));
        return this._renderRadioButtonList(this.content('test-list'), 'test', tests, this.selectTests.bind(this));
    }

    _renderTriggerablePlatforms(selectedTests, triggerablePlatforms)
    {
        if (!selectedTests.length) {
            this.content('platform-pane').style.display = 'none';
            return null;
        }
        this.content('platform-pane').style.display = null;

        return this._renderRadioButtonList(this.content('platform-list'), 'platform', triggerablePlatforms, (selectedPlatforms) => {
            this.selectPlatform(selectedPlatforms.length ? selectedPlatforms[0] : null);
        });
    }

    _renderRadioButtonList(listContainer, name, objects, callback)
    {
        const listItems = [];
        let selectedListItems = [];
        const checkSelectedRadioButtons = (newSelectedListItems) => {
            selectedListItems.forEach((item) => {
                item.label.classList.remove('selected');
                item.radioButton.checked = false;
            });
            selectedListItems = newSelectedListItems;
            selectedListItems.forEach((item) => {
                item.label.classList.add('selected');
                item.radioButton.checked = true;
            });
        }

        const element = ComponentBase.createElement;
        this.renderReplace(listContainer, objects.map((object) => {
            const radioButton = element('input', {type: 'radio', name: name, onchange: () => {
                checkSelectedRadioButtons(listItems.filter((item) => item.radioButton.checked));
                callback(selectedListItems.map((item) => item.object));
                this.enqueueToRender();
            }});
            const label = element('label', [radioButton, object.label()]);
            listItems.push({radioButton, label, object});
            return element('li', label);
        }));

        return new LazilyEvaluatedFunction((...selectedObjects) => {
            const objects = new Set(selectedObjects);
            checkSelectedRadioButtons(listItems.filter((item) => objects.has(item.object)));
        });
    }

    _updateTriggerable(tests, platform)
    {
        let triggerable = null;
        let error = null;
        if (tests.length && platform) {
            triggerable = Triggerable.findByTestConfiguration(tests[0], platform);
            let matchingTests = new Set;
            let mismatchingTests = new Set;
            for (let test of tests) {
                if (Triggerable.findByTestConfiguration(test, platform) == triggerable)
                    matchingTests.add(test);
                else
                    mismatchingTests.add(test);
            }
            if (matchingTests.size < tests.length) {
                const matchingTestNames = [...matchingTests].map((test) => test.fullName()).sort().join('", "');
                const mismathingTestNames = [...mismatchingTests].map((test) => test.fullName()).sort().join('", "');
                error = `Tests "${matchingTestNames}" and "${mismathingTestNames}" cannot be scheduled
                    simultenosuly on "${platform.name()}". Please select one of them at a time.`;
            }
        }

        return [triggerable, error];
    }

    _updateRepositoryGroups(triggerable)
    {
        const repositoryGroups = triggerable ? TriggerableRepositoryGroup.sortByNamePreferringSmallerRepositories(triggerable.repositoryGroups()) : [];
        for (let name in this._repositoryGroupByConfiguration) {
            const currentGroup = this._repositoryGroupByConfiguration[name];
            let matchingGroup = null;
            if (currentGroup) {
                if (repositoryGroups.includes(currentGroup))
                    matchingGroup = currentGroup;
                else
                    matchingGroup = repositoryGroups.find((group) => group.name() == currentGroup.name());
            }
            if (!matchingGroup && repositoryGroups.length)
                matchingGroup = repositoryGroups[0];
            this._repositoryGroupByConfiguration[name] = matchingGroup;
        }
    }

    _updateCommitSetMap()
    {
        const newBaseline = this._computeCommitSet('Baseline');
        let newComparison = this._computeCommitSet('Comparison');
        if (newBaseline && newComparison && newBaseline.equals(newComparison))
            newComparison = null;

        const currentBaseline = this._commitSetMap['Baseline'];
        const currentComparison = this._commitSetMap['Baseline'];
        if (newBaseline == currentBaseline && newComparison == currentComparison)
            return; // Both of them are null.

        if (newBaseline && currentBaseline && newBaseline.equals(currentBaseline)
            && newComparison && currentComparison && newComparison.equals(currentComparison))
            return;

        this._commitSetMap = {'Baseline': newBaseline, 'Comparison': newComparison};

        this.dispatchAction('commitSetChange');
        this.enqueueToRender();
    }

    _computeCommitSet(configurationName)
    {
        const repositoryGroup = this._repositoryGroupByConfiguration[configurationName];
        if (!repositoryGroup)
            return null;

        const fileUploader = this._customRootUploaders[configurationName];
        if (!fileUploader || fileUploader.hasFileToUpload())
            return null;

        const commitSet = new CustomCommitSet;
        for (let repository of repositoryGroup.repositories()) {
            let revision = this._specifiedRevisions[configurationName].get(repository);
            if (!revision)
                revision = this._fetchedRevisions[configurationName].get(repository);
            if (!revision)
                return null;
            let patch = null;
            if (repositoryGroup.acceptsPatchForRepository(repository)) {
                const uploaderMap = this._patchUploaders[configurationName];
                const uploader = uploaderMap.get(repository);
                if (uploader) {
                    const files = uploader.uploadedFiles();
                    console.assert(files.length <= 1);
                    if (files.length)
                        patch = files[0];
                }
            }
            commitSet.setRevisionForRepository(repository, revision, patch);
        }

        for (let uploadedFile of fileUploader.uploadedFiles())
            commitSet.addCustomRoot(uploadedFile);

        return commitSet;
    }

    _renderRepositoryPanes(triggerable, error, platform, repositoryGroupByConfiguration, showComparison)
    {
        this.content('repository-configuration-error-pane').style.display = error ? null : 'none';
        this.content('error').textContent = error;

        this.content('baseline-configuration-pane').style.display = triggerable ? null : 'none';
        this.content('specify-comparison-pane').style.display = triggerable && !showComparison ? null : 'none';
        this.content('comparison-configuration-pane').style.display = triggerable && showComparison ? null : 'none';

        if (!triggerable)
            return;

        const repositoryGroups = TriggerableRepositoryGroup.sortByNamePreferringSmallerRepositories(triggerable.repositoryGroups());

        const repositorySet = new Set;
        for (let group of repositoryGroups) {
            for (let repository of group.repositories())
                repositorySet.add(repository);
        }

        const repositories = Repository.sortByNamePreferringOnesWithURL([...repositorySet]);
        const requiredRepositories = repositories.filter((repository) => {
            return repositoryGroups.every((group) => group.repositories().includes(repository));
        });
        const alwaysAcceptsCustomRoots = repositoryGroups.every((group) => group.acceptsCustomRoots());

        this._renderBaselineRevisionTable(platform, repositoryGroups, requiredRepositories, repositoryGroupByConfiguration, alwaysAcceptsCustomRoots);

        if (showComparison)
            this._renderComparisonRevisionTable(platform, repositoryGroups, requiredRepositories, repositoryGroupByConfiguration, alwaysAcceptsCustomRoots);
    }

    _renderBaselineRevisionTable(platform, repositoryGroups, requiredRepositories, repositoryGroupByConfiguration, alwaysAcceptsCustomRoots)
    {
        let currentGroup = repositoryGroupByConfiguration['Baseline'];
        const optionalRepositoryList = this._optionalRepositoryList(currentGroup, requiredRepositories);
        this.renderReplace(this.content('baseline-revision-table'),
            this._buildRevisionTable('Baseline', repositoryGroups, currentGroup, platform, requiredRepositories, optionalRepositoryList, alwaysAcceptsCustomRoots));
    }

    _renderComparisonRevisionTable(platform, repositoryGroups, requiredRepositories, repositoryGroupByConfiguration, alwaysAcceptsCustomRoots)
    {
        let currentGroup = repositoryGroupByConfiguration['Comparison'];
        const optionalRepositoryList = this._optionalRepositoryList(currentGroup, requiredRepositories);
        this.renderReplace(this.content('comparison-revision-table'),
            this._buildRevisionTable('Comparison', repositoryGroups, currentGroup, platform, requiredRepositories, optionalRepositoryList, alwaysAcceptsCustomRoots));
    }

    _optionalRepositoryList(currentGroup, requiredRepositories)
    {
        if (!currentGroup)
            return [];
        return Repository.sortByNamePreferringOnesWithURL(currentGroup.repositories().filter((repository) => !requiredRepositories.includes(repository)));
    }

    _buildRevisionTable(configurationName, repositoryGroups, currentGroup, platform, requiredRepositories, optionalRepositoryList, alwaysAcceptsCustomRoots)
    {
        const element = ComponentBase.createElement;
        const link = ComponentBase.createLink;

        const customRootsTBody = element('tbody', [
            element('tr', [
                element('th', 'Roots'),
                element('td', this._customRootUploaders[configurationName]),
            ]),
        ]);

        return [
            element('tbody',
                requiredRepositories.map((repository) => {
                    return element('tr', [
                        element('th', repository.name()),
                        element('td', this._buildRevisionInput(configurationName, repository, platform))
                    ]);
                })),
            alwaysAcceptsCustomRoots ? customRootsTBody : [],
            element('tbody', [
                element('tr', {'class': 'group-row'},
                    element('td', {colspan: 2}, this._buildRepositoryGroupList(repositoryGroups, currentGroup, configurationName))),
            ]),
            !alwaysAcceptsCustomRoots && currentGroup && currentGroup.acceptsCustomRoots() ? customRootsTBody : [],
            element('tbody',
                optionalRepositoryList.map((repository) => {
                    let uploader = currentGroup.acceptsPatchForRepository(repository)
                        ? this._ensurePatchUploader(configurationName, repository) : null;

                    return element('tr',[
                        element('th', repository.name()),
                        element('td', [
                            this._buildRevisionInput(configurationName, repository, platform),
                            uploader || [],
                        ])
                    ]);
                })
            )];
    }

    _buildRepositoryGroupList(repositoryGroups, currentGroup, configurationName)
    {
        const element = ComponentBase.createElement;
        return repositoryGroups.map((group) => {
            const input = element('input', {
                type: 'radio',
                name: 'repositoryGroup-for-' + configurationName.toLowerCase(),
                checked: currentGroup == group,
                onchange: () => this._selectRepositoryGroup(configurationName, group)
            });
            return [element('label', [input, group.description()])];
        });
    }

    _selectRepositoryGroup(configurationName, group)
    {
        const source = this._repositoryGroupByConfiguration;
        const clone = {};
        for (let key in source)
            clone[key] = source[key];
        clone[configurationName] = group;
        this._repositoryGroupByConfiguration = clone;
        this._updateCommitSetMap();
        this.enqueueToRender();
    }

    _buildRevisionInput(configurationName, repository, platform)
    {
        const revision = this._specifiedRevisions[configurationName].get(repository) || '';
        const element = ComponentBase.createElement;
        const input = element('input', {value: revision, oninput: () => {
            unmodifiedInput = null;
            this._specifiedRevisions[configurationName].set(repository, input.value);
            this._updateCommitSetMap();
        }});
        let unmodifiedInput = input;

        if (!revision) {
            CommitLog.fetchLatestCommitForPlatform(repository, platform).then((commit) => {
                if (commit && unmodifiedInput) {
                    unmodifiedInput.value = commit.revision();
                    this._fetchedRevisions[configurationName].set(repository, commit.revision());
                    this._updateCommitSetMap();
                }
            });
        }

        return input;
    }

    static htmlTemplate()
    {
        return `
            <section id="test-pane" class="pane">
                <h2>1. Select a Test</h2>
                <ul id="test-list" class="config-list"></ul>
            </section>
            <section id="platform-pane" class="pane">
                <h2>2. Select a Platform</h2>
                <ul id="platform-list" class="config-list"></ul>
            </section>
            <section id="repository-configuration-error-pane" class="pane">
                <h2>Incompatible tests</h2>
                <p id="error"></p>
            </section>
            <section id="baseline-configuration-pane" class="pane">
                <h2>3. Configure Baseline</h2>
                <table id="baseline-revision-table" class="revision-table"></table>
            </section>
            <section id="specify-comparison-pane" class="pane">
                <button id="specify-comparison-button">Configure to Compare</button>
            </section>
            <section id="comparison-configuration-pane" class="pane">
                <h2>4. Configure Comparison</h2>
                <table id="comparison-revision-table" class="revision-table"></table>
            </section>`;
    }

    static cssTemplate()
    {
        return `
            :host {
                display: flex !important;
                flex-direction: row !important;
            }
            .pane {
                margin-right: 1rem;
                padding: 0;
            }
            .pane h2 {
                padding: 0;
                margin: 0;
                margin-bottom: 0.5rem;
                font-size: 1.2rem;
                font-weight: inherit;
                text-align: center;
                white-space: nowrap;
            }

            .config-list {
                height: 20rem;
                overflow: scroll;
                display: block;
                margin: 0;
                padding: 0;
                list-style: none;
                font-size: inherit;
                font-weight: inherit;
                border: none;
                border-top: solid 1px #ddd;
                border-bottom: solid 1px #ddd;
                white-space: nowrap;
            }

            #platform-list:empty:before {
                content: "No matching platform";
                display: block;
                margin: 1rem 0.5rem;
                text-align: center;
            }

            .config-list label {
                display: block;
                padding: 0.1rem 0.2rem;
            }

            .config-list label:hover,
            .config-list a:hover {
                background: rgba(204, 153, 51, 0.1);
            }

            .config-list label.selected,
            .config-list a.selected {
                background: #eee;
            }

            .config-list a {
                display: block;
                padding: 0.1rem 0.2rem;
                text-decoration: none;
                color: inherit;
            }

            #repository-configuration-pane {
                position: relative;
            }

            #repository-configuration-pane > button  {
                margin-left: 19.5rem;
            }

            .revision-table {
                border: none;
                border-collapse: collapse;
                font-size: 1rem;
            }

            .revision-table thead {
                font-size: 1.2rem;
            }

            .revision-table tbody:empty {
                display: none;
            }

            .revision-table tbody td,
            .revision-table tbody th {
                border-top: solid 1px #ddd;
                padding-top: 0.5rem;
                padding-bottom: 0.5rem;
            }

            .revision-table td,
            .revision-table th {
                width: 15rem;
                height: 1.8rem;
                padding: 0 0.2rem;
                border: none;
                font-weight: inherit;
            }

            .revision-table thead th {
                text-align: center;
            }

            .revision-table th close-button {
                vertical-align: bottom;
            }

            .revision-table td:first-child,
            .revision-table th:first-child {
                width: 6rem;
            }

            .revision-table tr.group-row td {
                padding-left: 5rem;
            }

            label {
                white-space: nowrap;
                display: block;
            }

            input:not([type=radio]) {
                width: calc(100% - 0.6rem);
                padding: 0.1rem 0.2rem;
                font-size: 0.9rem;
                font-weight: inherit;
            }

            #specify-comparison-pane button {
                margin-top: 1.5rem;
                font-size: 1.1rem;
                font-weight: inherit;
            }

            #start-pane button {
                margin-top: 1.5rem;
                font-size: 1.2rem;
                font-weight: inherit;
            }
`;
    }
}

ComponentBase.defineElement('custom-analysis-task-configurator', CustomAnalysisTaskConfigurator);
