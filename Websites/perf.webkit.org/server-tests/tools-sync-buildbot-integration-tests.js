'use strict';

const assert = require('assert');

require('../tools/js/v3-models.js');

const BuildbotTriggerable = require('../tools/js/buildbot-triggerable.js').BuildbotTriggerable;
const MockData = require('./resources/mock-data.js');
const MockLogger = require('./resources/mock-logger.js').MockLogger;
const MockRemoteAPI = require('../unit-tests/resources/mock-remote-api.js').MockRemoteAPI;
const TestServer = require('./resources/test-server.js');
const TemporaryFile = require('./resources/temporary-file.js').TemporaryFile;
const addSlaveForReport = require('./resources/common-operations.js').addSlaveForReport;
const prepareServerTest = require('./resources/common-operations.js').prepareServerTest;

function createTriggerable()
{
    let triggerable;
    const config = {
            triggerableName: 'build-webkit',
            lookbackCount: 2,
            buildRequestArgument: 'build-request-id',
            slaveName: 'sync-slave',
            slavePassword: 'password',
            repositoryGroups: {
                'webkit': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'wk': {'revision': 'WebKit'}, 'roots': {'roots': {}}},
                    buildProperties: {'wk': {'revision': 'WebKit'}, 'wk-patch': {'patch': 'WebKit'},
                        'checkbox': {'ifRepositorySet': ['WebKit'], 'value': 'build-wk'},
                        'owned-commits': {'ownedRevisions': 'WebKit'}},
                    acceptsRoots: true,
                }
            },
            types: {
                'some': {
                    test: ['some test'],
                    properties: {'test': 'some-test'},
                }
            },
            builders: {
                'builder-1': {
                    builder: 'some tester',
                    properties: {forcescheduler: 'force-ab-tests'},
                },
                'builder-2': {
                    builder: 'some builder',
                    properties: {forcescheduler: 'force-ab-builds'},
                },
                'builder-3': {
                    builder: 'other builder',
                    properties: {forcescheduler: 'force-ab-builds'},
                },
            },
            buildConfigurations: [
                {platforms: ['some platform'], builders: ['builder-2', 'builder-3']},
            ],
            testConfigurations: [
                {types: ['some'], platforms: ['some platform'], builders: ['builder-1']},
            ],
        };
    return MockData.addMockConfiguration(TestServer.database()).then(() => {
        return Manifest.fetch();
    }).then(() => {
        triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, {name: 'sync-slave', password: 'password'}, new MockLogger);
        return triggerable.initSyncers().then(() => triggerable.updateTriggerable());
    }).then(() => Manifest.fetch()).then(() => {
        return new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, {name: 'sync-slave', password: 'password'}, new MockLogger);
    });
}

function createTestGroupWihPatch()
{
    return TemporaryFile.makeTemporaryFile('patch.dat', 'patch file').then((patchFile) => {
        return UploadedFile.uploadFile(patchFile);
    }).then((patchFile) => {
        const someTest = Test.findById(MockData.someTestId());
        const webkit = Repository.findById(MockData.webkitRepositoryId());
        const set1 = new CustomCommitSet;
        set1.setRevisionForRepository(webkit, '191622', patchFile);
        const set2 = new CustomCommitSet;
        set2.setRevisionForRepository(webkit, '191622');
        return TestGroup.createWithTask('custom task', Platform.findById(MockData.somePlatformId()), someTest, 'some group', 2, [set1, set2]);
    }).then((task) => {
        return TestGroup.findAllByTask(task.id())[0];
    })
}

function createTestGroupWihOwnedCommit()
{
    const someTest = Test.findById(MockData.someTestId());
    const webkit = Repository.findById(MockData.webkitRepositoryId());
    const ownedSJC = Repository.findById(MockData.ownedJSCRepositoryId());
    const set1 = new CustomCommitSet;
    set1.setRevisionForRepository(webkit, '191622');
    set1.setRevisionForRepository(ownedSJC, 'owned-jsc-6161', null, '191622');
    const set2 = new CustomCommitSet;
    set2.setRevisionForRepository(webkit, '192736');
    set2.setRevisionForRepository(ownedSJC, 'owned-jsc-9191', null, '192736');
    return TestGroup.createWithTask('custom task', Platform.findById(MockData.somePlatformId()), someTest, 'some group', 2, [set1, set2]).then((task) => {
        return TestGroup.findAllByTask(task.id())[0];
    });
}

function uploadRoot(buildRequestId, buildNumber)
{
    return TemporaryFile.makeTemporaryFile(`root${buildNumber}.dat`, `root for build ${buildNumber}`).then((rootFile) => {
        return TestServer.remoteAPI().postFormData('/api/upload-root/', {
            slaveName: 'sync-slave',
            slavePassword: 'password',
            builderName: 'some builder',
            buildNumber: buildNumber,
            buildTime: '2017-05-10T02:54:08.666',
            buildRequest: buildRequestId,
            rootFile,
            repositoryList: '["WebKit"]',
        });
    });
}

describe('sync-buildbot', function () {
    prepareServerTest(this);
    TemporaryFile.inject();

    beforeEach(() => {
        MockRemoteAPI.reset('http://build.webkit.org');
    });

    function assertAndResolveRequest(request, method, url, contentToResolve)
    {
        assert.equal(request.method, method);
        assert.equal(request.url, url);
        request.resolve(contentToResolve);
    }

    it('should schedule a build to build a patch', () => {
        const requests = MockRemoteAPI.requests;
        let triggerable;
        let taskId = null;
        let syncPromise;
        return createTriggerable().then((newTriggerable) => {
            triggerable = newTriggerable;
            return createTestGroupWihPatch();
        }).then((testGroup) => {
            taskId = testGroup.task().id();
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(buildRequest.statusUrl(), null);
            assert.equal(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            const webkitPatch = commitSet.patchForRepository(webkit);
            assert(webkitPatch instanceof UploadedFile);
            assert.equal(webkitPatch.filename(), 'patch.dat');
            assert.equal(commitSet.rootForRepository(webkit), null);
            assert.deepEqual(commitSet.allRootFiles(), []);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '191622');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 7);
            assertAndResolveRequest(requests[6], 'POST', '/builders/some%20builder/force', 'OK');
            assert.deepEqual(requests[6].data, {'wk': '191622', 'wk-patch': RemoteAPI.url('/api/uploaded-file/1.dat'),
                'build-request-id': '1', 'forcescheduler': 'force-ab-builds', 'checkbox': 'build-wk'});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 10);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/some%20builder/pendingBuilds',
                [MockData.pendingBuild({builder: 'some builder', buildRequestId: 1})]);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 13);
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 1})
            });
            assertAndResolveRequest(requests[12], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Running');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.equal(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            const webkitPatch = commitSet.patchForRepository(webkit);
            assert(webkitPatch instanceof UploadedFile);
            assert.equal(webkitPatch.filename(), 'patch.dat');
            assert.equal(commitSet.rootForRepository(webkit), null);
            assert.deepEqual(commitSet.allRootFiles(), []);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '191622');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            return uploadRoot(buildRequest.id(), 123);
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            const webkitPatch = commitSet.patchForRepository(webkit);
            assert(webkitPatch instanceof UploadedFile);
            assert.equal(webkitPatch.filename(), 'patch.dat');
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '191622');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            MockRemoteAPI.reset();
            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1})
            });
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 7);
            assertAndResolveRequest(requests[6], 'POST', '/builders/some%20builder/force', 'OK');
            assert.deepEqual(requests[6].data, {'wk': '191622', 'build-request-id': '2', 'forcescheduler': 'force-ab-builds', 'checkbox': 'build-wk'});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 10);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 13);
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 2}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
            });
            assertAndResolveRequest(requests[12], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            const webkitPatch = commitSet.patchForRepository(webkit);
            assert(webkitPatch instanceof UploadedFile);
            assert.equal(webkitPatch.filename(), 'patch.dat');
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Running');
            assert.equal(otherBuildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '191622');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            return uploadRoot(otherBuildRequest.id(), 124);
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            const webkitPatch = commitSet.patchForRepository(webkit);
            assert(webkitPatch instanceof UploadedFile);
            assert.equal(webkitPatch.filename(), 'patch.dat');
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Completed');
            assert.equal(otherBuildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '191622');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            const otherWebkitRoot = otherCommitSet.rootForRepository(webkit);
            assert(otherWebkitRoot instanceof UploadedFile);
            assert.equal(otherWebkitRoot.filename(), 'root124.dat');
            assert.deepEqual(otherCommitSet.allRootFiles(), [otherWebkitRoot]);
        });
    });

    it('should schedule a build to test after building a patch', () => {
        const requests = MockRemoteAPI.requests;
        let triggerable;
        let taskId = null;
        let syncPromise;
        let firstRoot = null;
        return createTriggerable().then((newTriggerable) => {
            triggerable = newTriggerable;
            return createTestGroupWihPatch();
        }).then((testGroup) => {
            taskId = testGroup.task().id();
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert.equal(buildRequest.id(), 1);
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(buildRequest.buildId(), null);
            assert.deepEqual(buildRequest.commitSet().allRootFiles(), []);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert.equal(otherBuildRequest.id(), 2);
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.buildId(), null);
            assert.deepEqual(otherBuildRequest.commitSet().allRootFiles(), []);

            return uploadRoot(1, 45);
        }).then(() => {
            return uploadRoot(2, 46);
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.notEqual(buildRequest.buildId(), null);
            const roots = buildRequest.commitSet().allRootFiles();
            assert.equal(roots.length, 1);
            firstRoot = roots[0];
            assert.deepEqual(roots[0].filename(), 'root45.dat');

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Completed');
            assert.notEqual(otherBuildRequest.buildId(), null);
            const otherRoots = otherBuildRequest.commitSet().allRootFiles();
            assert.equal(otherRoots.length, 1);
            assert.deepEqual(otherRoots[0].filename(), 'root46.dat');
            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 2}),
            });
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 7);
            assertAndResolveRequest(requests[6], 'POST', '/builders/some%20tester/force', 'OK');
            assert.deepEqual(requests[6].data, {'test': 'some-test', 'wk': '191622', 'build-request-id': '3', 'forcescheduler': 'force-ab-tests',
                'roots': JSON.stringify([{url: firstRoot.url()}])});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 10);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20tester/pendingBuilds', [
                MockData.pendingBuild({builder: 'some tester', buildRequestId: 3}),
            ]);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 13);
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 2}),
            });
            assertAndResolveRequest(requests[12], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        });
    });

    it('should not schedule a build to test while building a patch', () => {
        const requests = MockRemoteAPI.requests;
        let triggerable;
        let taskId = null;
        let syncPromise;
        return createTriggerable().then((newTriggerable) => {
            triggerable = newTriggerable;
            return createTestGroupWihPatch();
        }).then((testGroup) => {
            taskId = testGroup.task().id();
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert.equal(buildRequest.id(), 1);
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(buildRequest.statusUrl(), null);
            assert.equal(buildRequest.buildId(), null);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert.equal(otherBuildRequest.id(), 2);
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return Promise.all([MockRemoteAPI.waitForRequest(), uploadRoot(1, 123)]);
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 2}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
            });
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 9);
            assertAndResolveRequest(requests[6], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 12);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 2, buildNumber: 1002}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
            });
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);

            const testGroup = testGroups[0];
            const buildRequest = testGroup.buildRequests()[0];
            assert.equal(buildRequest.id(), 1);
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), null);
            assert.notEqual(buildRequest.buildId(), null);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert.equal(otherBuildRequest.id(), 2);
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Running');
            assert.equal(otherBuildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/1002');
            assert.equal(otherBuildRequest.buildId(), null);
        });
    });

    it('should cancel builds for testing when a build to build a patch fails', () => {
        const requests = MockRemoteAPI.requests;
        let triggerable;
        let taskId = null;
        let syncPromise;
        return createTriggerable().then((newTriggerable) => {
            triggerable = newTriggerable;
            return createTestGroupWihPatch();
        }).then((testGroup) => {
            taskId = testGroup.task().id();
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert.equal(buildRequest.id(), 1);
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(buildRequest.statusUrl(), null);
            assert.equal(buildRequest.buildId(), null);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert.equal(otherBuildRequest.id(), 2);
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'other builder', buildRequestId: 1, buildNumber: 312}),
            });
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 9);
            assertAndResolveRequest(requests[6], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 12);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'other builder', buildRequestId: 1, buildNumber: 312}),
            });
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);

            const buildReqeusts = testGroups[0].buildRequests();
            assert(buildReqeusts[0].isBuild());
            assert(!buildReqeusts[0].isTest());
            assert.equal(buildReqeusts[0].statusLabel(), 'Failed');
            assert.equal(buildReqeusts[0].statusUrl(), 'http://build.webkit.org/builders/other%20builder/builds/312');
            assert.equal(buildReqeusts[0].buildId(), null);

            assert(buildReqeusts[1].isBuild());
            assert(!buildReqeusts[1].isTest());
            assert.equal(buildReqeusts[1].statusLabel(), 'Failed');
            assert.equal(buildReqeusts[1].statusUrl(), null);
            assert.equal(buildReqeusts[1].buildId(), null);

            function assertTestBuildHasFailed(request)
            {
                assert(!request.isBuild());
                assert(request.isTest());
                assert.equal(request.statusLabel(), 'Failed');
                assert.equal(request.statusUrl(), null);
                assert.equal(request.buildId(), null);
            }

            assertTestBuildHasFailed(buildReqeusts[2]);
            assertTestBuildHasFailed(buildReqeusts[3]);
        });
    });

    it('should schedule a build to build binary for owned commits', () => {
        const requests = MockRemoteAPI.requests;
        let triggerable;
        let taskId = null;
        let syncPromise;
        return createTriggerable().then((newTriggerable) => {
            triggerable = newTriggerable;
            return createTestGroupWihOwnedCommit();
        }).then((testGroup) => {
            taskId = testGroup.task().id();
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            const ownedJSC = Repository.findById(MockData.ownedJSCRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Waiting');
            assert.equal(buildRequest.statusUrl(), null);
            assert.equal(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            assert.equal(commitSet.patchForRepository(webkit), null);
            assert.equal(commitSet.rootForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(ownedJSC), commitSet.revisionForRepository(webkit));
            assert.deepEqual(commitSet.allRootFiles(), []);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '192736');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(ownedJSC), otherCommitSet.revisionForRepository(webkit));
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 7);
            assertAndResolveRequest(requests[6], 'POST', '/builders/some%20builder/force', 'OK');
            assert.deepEqual(requests[6].data, {'wk': '191622', 'build-request-id': '1', 'forcescheduler': 'force-ab-builds', 'owned-commits': `{"WebKit":[{"revision":"owned-jsc-6161","repository":"JavaScriptCore","ownerRevision":"191622"}]}`});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 10);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/some%20builder/pendingBuilds',
                [MockData.pendingBuild({builder: 'some builder', buildRequestId: 1})]);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 13);
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 1})
            });
            assertAndResolveRequest(requests[12], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            const ownedJSC = Repository.findById(MockData.ownedJSCRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Running');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.equal(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            assert.equal(commitSet.patchForRepository(webkit), null);
            assert.equal(commitSet.rootForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(ownedJSC), commitSet.revisionForRepository(webkit));
            assert.deepEqual(commitSet.allRootFiles(), []);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '192736');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(ownedJSC), otherCommitSet.revisionForRepository(webkit));
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            return uploadRoot(buildRequest.id(), 123);
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            const ownedJSC = Repository.findById(MockData.ownedJSCRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            assert.equal(commitSet.patchForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(ownedJSC), commitSet.revisionForRepository(webkit));
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Waiting');
            assert.equal(otherBuildRequest.statusUrl(), null);
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '192736');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(ownedJSC), otherCommitSet.revisionForRepository(webkit));
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            MockRemoteAPI.reset();
            syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 3);
            assertAndResolveRequest(requests[0], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[1], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[2], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 6);
            assertAndResolveRequest(requests[3], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[4], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1})
            });
            assertAndResolveRequest(requests[5], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 7);
            assertAndResolveRequest(requests[6], 'POST', '/builders/some%20builder/force', 'OK');
            assert.deepEqual(requests[6].data, {'wk': '192736', 'build-request-id': '2', 'forcescheduler': 'force-ab-builds', 'owned-commits': `{"WebKit":[{"revision":"owned-jsc-9191","repository":"JavaScriptCore","ownerRevision":"192736"}]}`});
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 10);
            assertAndResolveRequest(requests[7], 'GET', '/json/builders/some%20tester/pendingBuilds', []);
            assertAndResolveRequest(requests[8], 'GET', '/json/builders/some%20builder/pendingBuilds', []);
            assertAndResolveRequest(requests[9], 'GET', '/json/builders/other%20builder/pendingBuilds', []);
            return MockRemoteAPI.waitForRequest();
        }).then(() => {
            assert.equal(requests.length, 13);
            assertAndResolveRequest(requests[10], 'GET', '/json/builders/some%20tester/builds/?select=-1&select=-2', {});
            assertAndResolveRequest(requests[11], 'GET', '/json/builders/some%20builder/builds/?select=-1&select=-2', {
                [-1]: MockData.runningBuild({builder: 'some builder', buildRequestId: 2}),
                [-2]: MockData.finishedBuild({builder: 'some builder', buildRequestId: 1}),
            });
            assertAndResolveRequest(requests[12], 'GET', '/json/builders/other%20builder/builds/?select=-1&select=-2', {});
            return syncPromise;
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            const ownedJSC = Repository.findById(MockData.ownedJSCRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            assert.equal(commitSet.patchForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(ownedJSC), commitSet.revisionForRepository(webkit));
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Running');
            assert.equal(otherBuildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.equal(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '192736');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.rootForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(ownedJSC), otherCommitSet.revisionForRepository(webkit));
            assert.deepEqual(otherCommitSet.allRootFiles(), []);

            return uploadRoot(otherBuildRequest.id(), 124);
        }).then(() => {
            return TestGroup.fetchForTask(taskId, true);
        }).then((testGroups) => {
            assert.equal(testGroups.length, 1);
            const testGroup = testGroups[0];
            const webkit = Repository.findById(MockData.webkitRepositoryId());
            const ownedJSC = Repository.findById(MockData.ownedJSCRepositoryId());
            assert.equal(testGroup.buildRequests().length, 6);

            const buildRequest = testGroup.buildRequests()[0];
            assert(buildRequest.isBuild());
            assert(!buildRequest.isTest());
            assert.equal(buildRequest.statusLabel(), 'Completed');
            assert.equal(buildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(buildRequest.buildId(), null);

            const commitSet = buildRequest.commitSet();
            assert.equal(commitSet.revisionForRepository(webkit), '191622');
            assert.equal(commitSet.patchForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(commitSet.ownerRevisionForRepository(ownedJSC), commitSet.revisionForRepository(webkit));
            const webkitRoot = commitSet.rootForRepository(webkit);
            assert(webkitRoot instanceof UploadedFile);
            assert.equal(webkitRoot.filename(), 'root123.dat');
            assert.deepEqual(commitSet.allRootFiles(), [webkitRoot]);

            const otherBuildRequest = testGroup.buildRequests()[1];
            assert(otherBuildRequest.isBuild());
            assert(!otherBuildRequest.isTest());
            assert.equal(otherBuildRequest.statusLabel(), 'Completed');
            assert.equal(otherBuildRequest.statusUrl(), 'http://build.webkit.org/builders/some%20builder/builds/124');
            assert.notEqual(otherBuildRequest.buildId(), null);

            const otherCommitSet = otherBuildRequest.commitSet();
            assert.equal(otherCommitSet.revisionForRepository(webkit), '192736');
            assert.equal(otherCommitSet.patchForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(webkit), null);
            assert.equal(otherCommitSet.ownerRevisionForRepository(ownedJSC), otherCommitSet.revisionForRepository(webkit));
            const otherWebkitRoot = otherCommitSet.rootForRepository(webkit);
            assert(otherWebkitRoot instanceof UploadedFile);
            assert.equal(otherWebkitRoot.filename(), 'root124.dat');
            assert.deepEqual(otherCommitSet.allRootFiles(), [otherWebkitRoot]);
        });
    });
});
