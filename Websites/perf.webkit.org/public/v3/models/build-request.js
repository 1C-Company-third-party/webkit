'use strict';

class BuildRequest extends DataModelObject {

    constructor(id, object)
    {
        super(id, object);
        this._triggerable = object.triggerable;
        console.assert(!object.repositoryGroup || object.repositoryGroup instanceof TriggerableRepositoryGroup);
        this._analysisTaskId = object.task;
        this._testGroupId = object.testGroupId;
        console.assert(!object.testGroup || object.testGroup instanceof TestGroup);
        this._testGroup = object.testGroup;
        if (this._testGroup)
            this._testGroup.addBuildRequest(this);
        this._repositoryGroup = object.repositoryGroup;
        console.assert(object.platform instanceof Platform);
        this._platform = object.platform;
        console.assert(!object.test || object.test instanceof Test);
        this._test = object.test;
        this._order = object.order;
        console.assert(object.commitSet instanceof CommitSet);
        this._commitSet = object.commitSet;
        this._status = object.status;
        this._statusUrl = object.url;
        this._buildId = object.build;
        this._createdAt = new Date(object.createdAt);
        this._result = null;
    }

    updateSingleton(object)
    {
        console.assert(this._order == object.order);
        console.assert(this._commitSet == object.commitSet);

        const testGroup = object.testGroup;
        console.assert(!this._testGroup || this._testGroup == testGroup);
        if (!this._testGroup && testGroup)
            testGroup.addBuildRequest(this);

        this._testGroup = testGroup;
        this._status = object.status;
        this._statusUrl = object.url;
        this._buildId = object.build;
    }

    triggerable() { return this._triggerable; }
    analysisTaskId() { return this._analysisTaskId; }
    testGroupId() { return this._testGroupId; }
    testGroup() { return this._testGroup; }
    repositoryGroup() { return this._repositoryGroup; }
    platform() { return this._platform; }
    test() { return this._test; }
    isBuild() { return this._order < 0; }
    isTest() { return this._order >= 0; }
    order() { return +this._order; }
    commitSet() { return this._commitSet; }

    status() { return this._status; }
    hasFinished() { return this._status == 'failed' || this._status == 'completed' || this._status == 'canceled'; }
    hasCompleted() { return this._status == 'completed'; }
    hasStarted() { return this._status != 'pending'; }
    isScheduled() { return this._status == 'scheduled'; }
    isPending() { return this._status == 'pending'; }
    statusLabel()
    {
        switch (this._status) {
        case 'pending':
            return 'Waiting';
        case 'scheduled':
            return 'Scheduled';
        case 'running':
            return 'Running';
        case 'failed':
            return 'Failed';
        case 'completed':
            return 'Completed';
        case 'canceled':
            return 'Canceled';
        }
    }
    statusUrl() { return this._statusUrl; }

    buildId() { return this._buildId; }
    createdAt() { return this._createdAt; }

    waitingTime(referenceTime)
    {
        var units = [
            {unit: 'week', length: 7 * 24 * 3600},
            {unit: 'day', length: 24 * 3600},
            {unit: 'hour', length: 3600},
            {unit: 'minute', length: 60},
        ];

        var diff = (referenceTime - this.createdAt()) / 1000;

        var indexOfFirstSmallEnoughUnit = units.length - 1;
        for (var i = 0; i < units.length; i++) {
            if (diff > 1.5 * units[i].length) {
                indexOfFirstSmallEnoughUnit = i;
                break;
            }
        }

        var label = '';
        var lastUnit = false;
        for (var i = indexOfFirstSmallEnoughUnit; !lastUnit; i++) {
            lastUnit = i == indexOfFirstSmallEnoughUnit + 1 || i == units.length - 1;
            var length = units[i].length;
            var valueForUnit = lastUnit ? Math.round(diff / length) : Math.floor(diff / length);

            var unit = units[i].unit + (valueForUnit == 1 ? '' : 's');
            if (label)
                label += ' ';
            label += `${valueForUnit} ${unit}`;

            diff = diff - valueForUnit * length;
        }

        return label;
    }

    static fetchForTriggerable(triggerable)
    {
        return RemoteAPI.getJSONWithStatus('/api/build-requests/' + triggerable).then(function (data) {
            return BuildRequest.constructBuildRequestsFromData(data);
        });
    }

    static constructBuildRequestsFromData(data)
    {
        for (let rawData of data['commits']) {
            rawData.repository = Repository.findById(rawData.repository);
            CommitLog.ensureSingleton(rawData.id, rawData);
        }

        for (let uploadedFile of data['uploadedFiles'])
            UploadedFile.ensureSingleton(uploadedFile.id, uploadedFile);

        const commitSets = data['commitSets'].map((rawData) => {
            for (const item of rawData.revisionItems) {
                item.commit = CommitLog.findById(item.commit);
                item.patch = item.patch ? UploadedFile.findById(item.patch) : null;
                item.rootFile = item.rootFile ? UploadedFile.findById(item.rootFile) : null;
                item.commitOwner = item.commitOwner ? CommitLog.findById(item.commitOwner) : null;
            }
            rawData.customRoots = rawData.customRoots.map((fileId) => UploadedFile.findById(fileId));
            return CommitSet.ensureSingleton(rawData.id, rawData);
        });

        return data['buildRequests'].map(function (rawData) {
            rawData.triggerable = Triggerable.findById(rawData.triggerable);
            rawData.repositoryGroup = TriggerableRepositoryGroup.findById(rawData.repositoryGroup);
            rawData.platform = Platform.findById(rawData.platform);
            rawData.test = Test.findById(rawData.test);
            rawData.testGroupId = rawData.testGroup;
            rawData.testGroup = TestGroup.findById(rawData.testGroup);
            rawData.commitSet = CommitSet.findById(rawData.commitSet);
            return BuildRequest.ensureSingleton(rawData.id, rawData);
        });
    }
}

if (typeof module != 'undefined')
    module.exports.BuildRequest = BuildRequest;
