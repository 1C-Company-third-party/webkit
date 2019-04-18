'use strict';

const assert = require('assert');

const BuildbotTriggerable = require('../tools/js/buildbot-triggerable.js').BuildbotTriggerable;
const MockData = require('./resources/mock-data.js');
const MockRemoteAPI = require('../unit-tests/resources/mock-remote-api.js').MockRemoteAPI;
const TestServer = require('./resources/test-server.js');
const prepareServerTest = require('./resources/common-operations.js').prepareServerTest;
const MockLogger = require('./resources/mock-logger.js').MockLogger;

function assertRequestAndResolve(request, method, url, content)
{
    assert.equal(request.method, method);
    assert.equal(request.url, url);
    request.resolve(content);
}

describe('BuildbotTriggerable', function () {
    prepareServerTest(this);

    beforeEach(function () {
        MockData.resetV3Models();
        MockRemoteAPI.reset('http://build.webkit.org');
    });

    describe('syncOnce', () => {
        it('should schedule the next build request when there are no pending builds', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['completed', 'running', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({[-1]: MockData.runningBuild(), [-2]: MockData.finishedBuild()});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[2].method, 'POST');
                assert.equal(MockRemoteAPI.requests[2].url, '/builders/some-builder-1/force');
                assert.deepEqual(MockRemoteAPI.requests[2].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '702'});
                MockRemoteAPI.requests[2].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[3].resolve([MockData.pendingBuild()])
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[4].method, 'GET');
                assert.equal(MockRemoteAPI.requests[4].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[4].resolve({[-1]: MockData.runningBuild(), [-2]: MockData.finishedBuild()});
                return syncPromise;
            }).then(() => {
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithSingleBuilder().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(702).status(), 'scheduled');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
            });
        });

        it('should not schedule the next build request when there is a pending build', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['completed', 'running', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                let config = MockData.mockTestSyncConfigWithSingleBuilder();
                let logger = new MockLogger;
                let slaveInfo = {name: 'sync-slave', password: 'password'};
                let triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([MockData.pendingBuild()]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({[-1]: MockData.runningBuild(), [-2]: MockData.finishedBuild()});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[2].resolve([MockData.pendingBuild()])
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({[-1]: MockData.runningBuild(), [-2]: MockData.finishedBuild()});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithSingleBuilder().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(702).status(), 'scheduled');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
            });
        });

        it('should schedule the build request on a builder without a pending build if it\'s the first request in the group', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['pending', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithTwoBuilders();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([MockData.pendingBuild({buildRequestId: 999})]);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[1].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[2].resolve({});
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 5);
                assert.equal(MockRemoteAPI.requests[4].method, 'POST');
                assert.equal(MockRemoteAPI.requests[4].url, '/builders/some%20builder%202/force');
                assert.deepEqual(MockRemoteAPI.requests[4].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '700'});
                MockRemoteAPI.requests[4].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 7);
                assert.equal(MockRemoteAPI.requests[5].method, 'GET');
                assert.equal(MockRemoteAPI.requests[5].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[5].resolve([MockData.pendingBuild({buildRequestId: 999})]);
                assert.equal(MockRemoteAPI.requests[6].method, 'GET');
                assert.equal(MockRemoteAPI.requests[6].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[6].resolve([MockData.pendingBuild({builder: 'some builder 2', buildRequestId: 700})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 9);
                assert.equal(MockRemoteAPI.requests[7].method, 'GET');
                assert.equal(MockRemoteAPI.requests[7].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[7].resolve({});
                assert.equal(MockRemoteAPI.requests[8].method, 'GET');
                assert.equal(MockRemoteAPI.requests[8].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[8].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'pending');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'scheduled');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some%20builder%202/');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
            });
        });

        it('should not schedule a build request on a different builder than the one the first build request is pending', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['pending', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                let config = MockData.mockTestSyncConfigWithTwoBuilders();
                let logger = new MockLogger;
                let slaveInfo = {name: 'sync-slave', password: 'password'};
                let triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([MockData.pendingBuild({buildRequestId: 700})]);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[1].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[2].resolve({});
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 6);
                assert.equal(MockRemoteAPI.requests[4].method, 'GET');
                assert.equal(MockRemoteAPI.requests[4].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[4].resolve([MockData.pendingBuild({buildRequestId: 700})]);
                assert.equal(MockRemoteAPI.requests[5].method, 'GET');
                assert.equal(MockRemoteAPI.requests[5].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[5].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 8);
                assert.equal(MockRemoteAPI.requests[6].method, 'GET');
                assert.equal(MockRemoteAPI.requests[6].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[6].resolve({});
                assert.equal(MockRemoteAPI.requests[7].method, 'GET');
                assert.equal(MockRemoteAPI.requests[7].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[7].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'pending');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'scheduled');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
            });
        });

        it('should update the status of a pending build and schedule a new build if the pending build had started running', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['pending', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithTwoBuilders();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[1].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[2].resolve({[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.finishedBuild({buildRequestId: 700})});
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 5);
                assert.equal(MockRemoteAPI.requests[4].method, 'POST');
                assert.equal(MockRemoteAPI.requests[4].url, '/builders/some-builder-1/force');
                assert.deepEqual(MockRemoteAPI.requests[4].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '702'});
                MockRemoteAPI.requests[4].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 7);
                assert.equal(MockRemoteAPI.requests[5].method, 'GET');
                assert.equal(MockRemoteAPI.requests[5].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[5].resolve([MockData.pendingBuild({buildRequestId: 702})]);
                assert.equal(MockRemoteAPI.requests[6].method, 'GET');
                assert.equal(MockRemoteAPI.requests[6].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[6].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 9);
                assert.equal(MockRemoteAPI.requests[7].method, 'GET');
                assert.equal(MockRemoteAPI.requests[7].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[7].resolve({[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.finishedBuild({buildRequestId: 700})});
                assert.equal(MockRemoteAPI.requests[8].method, 'GET');
                assert.equal(MockRemoteAPI.requests[8].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[8].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'pending');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'failed');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/123');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(701).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/124');
                assert.equal(BuildRequest.findById(702).status(), 'scheduled');
                assert.equal(BuildRequest.findById(702).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
            });
        });

        it('should update the status of a scheduled build if the pending build had started running', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['scheduled', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                let config = MockData.mockTestSyncConfigWithSingleBuilder();
                let logger = new MockLogger;
                let slaveInfo = {name: 'sync-slave', password: 'password'};
                let triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 1);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([MockData.pendingBuild({buildRequestId: 700})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 3);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[2].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({[-1]: MockData.runningBuild({buildRequestId: 700})});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'scheduled');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'running');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/124');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
            });
        });

        it('should schedule a build request on a builder without pending builds if the request belongs to a new test group', () => {
            const db = TestServer.database();
            let syncPromise;
            return Promise.all([
                MockData.addMockData(db, ['completed', 'pending', 'pending', 'pending']),
                MockData.addAnotherMockTestGroup(db, ['pending', 'pending', 'pending', 'pending'])
            ]).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithTwoBuilders();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([MockData.pendingBuild({buildRequestId: 702})]);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[1].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[2].resolve({[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.finishedBuild({buildRequestId: 700})});
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 5);
                assert.equal(MockRemoteAPI.requests[4].method, 'POST');
                assert.equal(MockRemoteAPI.requests[4].url, '/builders/some%20builder%202/force');
                assert.deepEqual(MockRemoteAPI.requests[4].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '710'});
                MockRemoteAPI.requests[4].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 7);
                assert.equal(MockRemoteAPI.requests[5].method, 'GET');
                assert.equal(MockRemoteAPI.requests[5].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[5].resolve([MockData.pendingBuild({buildRequestId: 702})]);
                assert.equal(MockRemoteAPI.requests[6].method, 'GET');
                assert.equal(MockRemoteAPI.requests[6].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[6].resolve([MockData.pendingBuild({builder: 'some builder 2', buildRequestId: 710})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 9);
                assert.equal(MockRemoteAPI.requests[7].method, 'GET');
                assert.equal(MockRemoteAPI.requests[7].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[7].resolve({[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.finishedBuild({buildRequestId: 700})});
                assert.equal(MockRemoteAPI.requests[8].method, 'GET');
                assert.equal(MockRemoteAPI.requests[8].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[8].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 8);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                assert.equal(BuildRequest.findById(710).status(), 'pending');
                assert.equal(BuildRequest.findById(710).statusUrl(), null);
                assert.equal(BuildRequest.findById(711).status(), 'pending');
                assert.equal(BuildRequest.findById(711).statusUrl(), null);
                assert.equal(BuildRequest.findById(712).status(), 'pending');
                assert.equal(BuildRequest.findById(712).statusUrl(), null);
                assert.equal(BuildRequest.findById(713).status(), 'pending');
                assert.equal(BuildRequest.findById(713).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 8);
                assert.equal(BuildRequest.findById(700).status(), 'completed');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/123');
                assert.equal(BuildRequest.findById(701).status(), 'running');
                assert.equal(BuildRequest.findById(701).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/124');
                assert.equal(BuildRequest.findById(702).status(), 'scheduled');
                assert.equal(BuildRequest.findById(702).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                assert.equal(BuildRequest.findById(710).status(), 'scheduled');
                assert.equal(BuildRequest.findById(710).statusUrl(), 'http://build.webkit.org/builders/some%20builder%202/');
                assert.equal(BuildRequest.findById(711).status(), 'pending');
                assert.equal(BuildRequest.findById(711).statusUrl(), null);
                assert.equal(BuildRequest.findById(712).status(), 'pending');
                assert.equal(BuildRequest.findById(712).statusUrl(), null);
                assert.equal(BuildRequest.findById(713).status(), 'pending');
                assert.equal(BuildRequest.findById(713).statusUrl(), null);
            });
        });

        it('should schedule a build request on the same scheduler the first request had ran', () => {
            const db = TestServer.database();
            let syncPromise;
            return Promise.all([
                MockData.addMockData(db, ['running', 'pending', 'pending', 'pending']),
                MockData.addAnotherMockTestGroup(db, ['running', 'pending', 'pending', 'pending'])
            ]).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithTwoBuilders();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[1].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[2].resolve({[-1]: MockData.runningBuild({buildRequestId: 710})});
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({[-1]: MockData.runningBuild({builder: 'some builder 2', buildRequestId: 700})});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 6);
                assert.equal(MockRemoteAPI.requests[4].method, 'POST');
                assert.equal(MockRemoteAPI.requests[4].url, '/builders/some%20builder%202/force');
                assert.deepEqual(MockRemoteAPI.requests[4].data, {'wk': '192736', 'os': '10.11 15A284', 'build-request-id': '701'});
                MockRemoteAPI.requests[4].resolve('OK');
                assert.equal(MockRemoteAPI.requests[5].method, 'POST');
                assert.equal(MockRemoteAPI.requests[5].url, '/builders/some-builder-1/force');
                assert.deepEqual(MockRemoteAPI.requests[5].data, {'wk': '192736', 'os': '10.11 15A284', 'build-request-id': '711'});
                MockRemoteAPI.requests[5].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 8);
                assert.equal(MockRemoteAPI.requests[6].method, 'GET');
                assert.equal(MockRemoteAPI.requests[6].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[6].resolve([MockData.pendingBuild({buildRequestId: 711})]);
                assert.equal(MockRemoteAPI.requests[7].method, 'GET');
                assert.equal(MockRemoteAPI.requests[7].url, '/json/builders/some%20builder%202/pendingBuilds');
                MockRemoteAPI.requests[7].resolve([MockData.pendingBuild({builder: 'some builder 2',buildRequestId: 701})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 10);
                assert.equal(MockRemoteAPI.requests[8].method, 'GET');
                assert.equal(MockRemoteAPI.requests[8].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[8].resolve({[-1]: MockData.runningBuild({buildRequestId: 710})});
                assert.equal(MockRemoteAPI.requests[9].method, 'GET');
                assert.equal(MockRemoteAPI.requests[9].url, '/json/builders/some%20builder%202/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[9].resolve({[-1]: MockData.runningBuild({builder: 'some builder 2', buildRequestId: 700})});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 8);
                assert.equal(BuildRequest.findById(700).status(), 'running');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                assert.equal(BuildRequest.findById(710).status(), 'running');
                assert.equal(BuildRequest.findById(710).statusUrl(), null);
                assert.equal(BuildRequest.findById(711).status(), 'pending');
                assert.equal(BuildRequest.findById(711).statusUrl(), null);
                assert.equal(BuildRequest.findById(712).status(), 'pending');
                assert.equal(BuildRequest.findById(712).statusUrl(), null);
                assert.equal(BuildRequest.findById(713).status(), 'pending');
                assert.equal(BuildRequest.findById(713).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 8);
                assert.equal(BuildRequest.findById(700).status(), 'running');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some%20builder%202/builds/124');
                assert.equal(BuildRequest.findById(701).status(), 'scheduled');
                assert.equal(BuildRequest.findById(701).statusUrl(), 'http://build.webkit.org/builders/some%20builder%202/');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                assert.equal(BuildRequest.findById(710).status(), 'running');
                assert.equal(BuildRequest.findById(710).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/builds/124');
                assert.equal(BuildRequest.findById(711).status(), 'scheduled');
                assert.equal(BuildRequest.findById(711).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(712).status(), 'pending');
                assert.equal(BuildRequest.findById(712).statusUrl(), null);
                assert.equal(BuildRequest.findById(713).status(), 'pending');
                assert.equal(BuildRequest.findById(713).statusUrl(), null);
            });
        });

        it('should wait for POST to complete before trying to poll buildbot again', () => {
            const db = TestServer.database();
            const requests = MockRemoteAPI.requests;
            let syncPromise;
            return Promise.all([
                MockData.addMockData(db, ['pending', 'pending', 'pending', 'pending']),
                MockData.addAnotherMockTestGroup(db, ['pending', 'pending', 'pending', 'pending'])
            ]).then(() => Manifest.fetch()).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 1);
                assert.equal(requests[0].method, 'GET');
                assert.equal(requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 2);
                assert.equal(requests[1].method, 'GET');
                assert.equal(requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                requests[1].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 3);
                assert.equal(requests[2].method, 'POST');
                assert.equal(requests[2].url, '/builders/some-builder-1/force');
                assert.deepEqual(requests[2].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '700'});
                return new Promise((resolve) => setTimeout(resolve, 10));
            }).then(() => {
                assert.equal(requests.length, 3);
                requests[2].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 4);
                assert.equal(requests[3].method, 'GET');
                assert.equal(requests[3].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[3].resolve([MockData.pendingBuild({buildRequestId: 700})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 5);
                assert.equal(requests[4].method, 'GET');
                assert.equal(requests[4].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                requests[4].resolve({});
                return syncPromise;
            }).then(() => {
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 8);
                assert.equal(BuildRequest.findById(700).status(), 'scheduled');
                assert.equal(BuildRequest.findById(700).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                assert.equal(BuildRequest.findById(710).status(), 'pending');
                assert.equal(BuildRequest.findById(710).statusUrl(), null);
                assert.equal(BuildRequest.findById(711).status(), 'pending');
                assert.equal(BuildRequest.findById(711).statusUrl(), null);
                assert.equal(BuildRequest.findById(712).status(), 'pending');
                assert.equal(BuildRequest.findById(712).statusUrl(), null);
                assert.equal(BuildRequest.findById(713).status(), 'pending');
                assert.equal(BuildRequest.findById(713).statusUrl(), null);
            });
        });

        it('should recover from multiple test groups running simultenously', () => {
            const db = TestServer.database();
            const requests = MockRemoteAPI.requests;

            let syncPromise;
            let triggerable;
            return Promise.all([
                MockData.addMockData(db, ['completed', 'pending', 'pending', 'pending']),
                MockData.addAnotherMockTestGroup(db, ['completed', 'pending', 'pending', 'pending'])
            ]).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 1);
                assertRequestAndResolve(requests[0], 'GET', '/json/builders/some-builder-1/pendingBuilds', []);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 2);
                assertRequestAndResolve(requests[1], 'GET', '/json/builders/some-builder-1/builds/?select=-1&select=-2',
                    {[-1]: MockData.runningBuild({buildRequestId: 700}), [-2]: MockData.finishedBuild({buildRequestId: 710})});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 3);
                assertRequestAndResolve(requests[2], 'POST', '/builders/some-builder-1/force');
                assert.deepEqual(requests[2].data, {'wk': '192736', 'os': '10.11 15A284', 'build-request-id': '701'});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 4);
                assertRequestAndResolve(requests[3], 'GET', '/json/builders/some-builder-1/pendingBuilds',
                    [MockData.pendingBuild({buildRequestId: 701})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 5);
                assertRequestAndResolve(requests[4], 'GET', '/json/builders/some-builder-1/builds/?select=-1&select=-2',
                    {[-1]: MockData.runningBuild({buildRequestId: 700}), [-2]: MockData.finishedBuild({buildRequestId: 710})});
                return syncPromise;
            }).then(() => {
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 6);
                assertRequestAndResolve(requests[5], 'GET', '/json/builders/some-builder-1/pendingBuilds', []);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 7);
                assertRequestAndResolve(requests[6], 'GET', '/json/builders/some-builder-1/builds/?select=-1&select=-2',
                    {[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.runningBuild({buildRequestId: 700})});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 8);
                assertRequestAndResolve(requests[7], 'GET', '/json/builders/some-builder-1/pendingBuilds', []);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(requests.length, 9);
                assertRequestAndResolve(requests[8], 'GET', '/json/builders/some-builder-1/builds/?select=-1&select=-2',
                    {[-1]: MockData.runningBuild({buildRequestId: 701}), [-2]: MockData.runningBuild({buildRequestId: 700})});
                return syncPromise;
            });
        });

        it('should recover from missing failed build request', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['failed', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 1);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 3);
                assert.equal(MockRemoteAPI.requests[2].method, 'POST');
                assert.equal(MockRemoteAPI.requests[2].url, '/builders/some-builder-1/force');
                assert.deepEqual(MockRemoteAPI.requests[2].data, {'wk': '192736', 'os': '10.11 15A284', 'build-request-id': '701'});
                MockRemoteAPI.requests[2].resolve('OK');
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[3].resolve([MockData.pendingBuild({buildRequestId: 701})]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 5);
                assert.equal(MockRemoteAPI.requests[4].method, 'GET');
                assert.equal(MockRemoteAPI.requests[4].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[4].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'failed');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(701).statusUrl(), null);
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'failed');
                assert.equal(BuildRequest.findById(700).statusUrl(), null);
                assert.equal(BuildRequest.findById(701).status(), 'scheduled');
                assert.equal(BuildRequest.findById(701).statusUrl(), 'http://build.webkit.org/builders/some-builder-1/');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(702).statusUrl(), null);
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                assert.equal(BuildRequest.findById(703).statusUrl(), null);
            });
        });

        it('should update the status of a supposedly scheduled build that went missing', () => {
            const db = TestServer.database();
            let syncPromise;
            return MockData.addMockData(db, ['scheduled', 'pending', 'pending', 'pending']).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 1);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 3);
                assert.equal(MockRemoteAPI.requests[2].method, 'GET');
                assert.equal(MockRemoteAPI.requests[2].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[2].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 4);
                assert.equal(MockRemoteAPI.requests[3].method, 'GET');
                assert.equal(MockRemoteAPI.requests[3].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[3].resolve({});
                return syncPromise;
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'scheduled');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
                return BuildRequest.fetchForTriggerable(MockData.mockTestSyncConfigWithTwoBuilders().triggerableName);
            }).then(() => {
                assert.equal(BuildRequest.all().length, 4);
                assert.equal(BuildRequest.findById(700).status(), 'failed');
                assert.equal(BuildRequest.findById(701).status(), 'pending');
                assert.equal(BuildRequest.findById(702).status(), 'pending');
                assert.equal(BuildRequest.findById(703).status(), 'pending');
            });
        });

        it('should schedule a build request of an user created test group before ones created by automatic change detection', () => {
            const db = TestServer.database();
            let syncPromise;
            return Promise.all([
                MockData.addMockData(db, ['pending', 'pending', 'pending', 'pending']),
                MockData.addAnotherMockTestGroup(db, ['pending', 'pending', 'pending', 'pending'], 'rniwa'),
            ]).then(() => {
                return Manifest.fetch();
            }).then(() => {
                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const triggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                syncPromise = triggerable.initSyncers().then(() => triggerable.syncOnce());
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 1);
                assert.equal(MockRemoteAPI.requests[0].method, 'GET');
                assert.equal(MockRemoteAPI.requests[0].url, '/json/builders/some-builder-1/pendingBuilds');
                MockRemoteAPI.requests[0].resolve([]);
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 2);
                assert.equal(MockRemoteAPI.requests[1].method, 'GET');
                assert.equal(MockRemoteAPI.requests[1].url, '/json/builders/some-builder-1/builds/?select=-1&select=-2');
                MockRemoteAPI.requests[1].resolve({});
                return MockRemoteAPI.waitForRequest();
            }).then(() => {
                assert.equal(MockRemoteAPI.requests.length, 3);
                assert.equal(MockRemoteAPI.requests[2].method, 'POST');
                assert.equal(MockRemoteAPI.requests[2].url, '/builders/some-builder-1/force');
                assert.deepEqual(MockRemoteAPI.requests[2].data, {'wk': '191622', 'os': '10.11 15A284', 'build-request-id': '710'});
                MockRemoteAPI.requests[2].resolve('OK');
            });
        });
    });

    describe('updateTriggerables', () => {

        function refetchManifest()
        {
            MockData.resetV3Models();
            return TestServer.remoteAPI().getJSON('/api/manifest').then((content) => Manifest._didFetchManifest(content));
        }

        it('should update available triggerables', () => {
            const db = TestServer.database();
            let macos;
            let webkit;
            return MockData.addMockData(db).then(() => {
                return Manifest.fetch();
            }).then(() => {
                macos = Repository.findById(9);
                assert.equal(macos.name(), 'macOS');
                webkit = Repository.findById(11);
                assert.equal(webkit.name(), 'WebKit');
                assert.equal(Triggerable.all().length, 1);

                const triggerable = Triggerable.all()[0];
                assert.equal(triggerable.name(), 'build-webkit');

                const test = Test.findById(MockData.someTestId());
                const platform = Platform.findById(MockData.somePlatformId());
                assert.equal(Triggerable.findByTestConfiguration(test, platform), null);

                const groups = TriggerableRepositoryGroup.sortByName(triggerable.repositoryGroups());
                assert.equal(groups.length, 1);
                assert.equal(groups[0].name(), 'webkit-svn');
                assert.deepEqual(groups[0].repositories(), [webkit, macos]);

                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                config.repositoryGroups = {
                    'system-and-roots': {
                        description: 'Custom Roots',
                        repositories: {'macOS': {}},
                        testProperties: {
                            'os': {'revision': 'macOS'},
                            'roots': {'roots': {}}
                        },
                        acceptsRoots: true
                    },
                    'system-and-webkit': {
                        repositories: {'WebKit': {'acceptsPatch': true}, 'macOS': {}},
                        testProperties: {
                            'os': {'revision': 'macOS'},
                            'wk': {'revision': 'WebKit'},
                            'roots': {'roots': {}},
                        },
                        buildProperties: {
                            'wk': {'revision': 'WebKit'},
                            'wk-patch': {'patch': 'WebKit'},
                        },
                        acceptsRoots: true
                    }
                }

                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const buildbotTriggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                return buildbotTriggerable.initSyncers().then(() => buildbotTriggerable.updateTriggerable());
            }).then(() => refetchManifest()).then(() => {
                assert.equal(Triggerable.all().length, 1);

                let test = Test.findById(MockData.someTestId());
                let platform = Platform.findById(MockData.somePlatformId());
                let triggerable = Triggerable.findByTestConfiguration(test, platform);
                assert.equal(triggerable.name(), 'build-webkit');

                const groups = TriggerableRepositoryGroup.sortByName(triggerable.repositoryGroups());
                assert.equal(groups.length, 2);
                assert.equal(groups[0].name(), 'system-and-roots');
                assert.equal(groups[0].description(), 'Custom Roots');
                assert.deepEqual(groups[0].repositories(), [macos]);
                assert.equal(groups[0].acceptsCustomRoots(), true);
                assert.equal(groups[1].name(), 'system-and-webkit');
                assert.deepEqual(groups[1].repositories(), [webkit, macos]);
                assert.equal(groups[1].acceptsCustomRoots(), true);

                const config = MockData.mockTestSyncConfigWithSingleBuilder();
                config.repositoryGroups = [ ];

                const logger = new MockLogger;
                const slaveInfo = {name: 'sync-slave', password: 'password'};
                const buildbotTriggerable = new BuildbotTriggerable(config, TestServer.remoteAPI(), MockRemoteAPI, slaveInfo, logger);
                return buildbotTriggerable.initSyncers().then(() => buildbotTriggerable.updateTriggerable());
            }).then(() => refetchManifest()).then(() => {
                assert.equal(Triggerable.all().length, 1);
                const groups = TriggerableRepositoryGroup.sortByName(Triggerable.all()[0].repositoryGroups());
                assert.equal(groups.length, 2);
                assert.equal(groups[0].name(), 'system-and-roots');
                assert.deepEqual(groups[0].repositories(), [macos]);
                assert.equal(groups[1].name(), 'system-and-webkit');
                assert.deepEqual(groups[1].repositories(), [webkit, macos]);
            })
        });
    });

});
