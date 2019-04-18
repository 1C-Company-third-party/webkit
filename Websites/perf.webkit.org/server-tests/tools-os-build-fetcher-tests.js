'use strict';

const assert = require('assert');

const OSBuildFetcher = require('../tools/js/os-build-fetcher.js').OSBuildFetcher;
const MockRemoteAPI = require('../unit-tests/resources/mock-remote-api.js').MockRemoteAPI;
const TestServer = require('./resources/test-server.js');
const addSlaveForReport = require('./resources/common-operations.js').addSlaveForReport;
const prepareServerTest = require('./resources/common-operations.js').prepareServerTest;
const MockSubprocess = require('./resources/mock-subprocess.js').MockSubprocess;
const MockLogger = require('./resources/mock-logger.js').MockLogger;


describe('OSBuildFetcher', function() {
    this.timeout(5000);
    TestServer.inject();

    beforeEach(function () {
        MockRemoteAPI.reset('http://build.webkit.org');
        MockSubprocess.reset();
    });

    const emptyReport = {
        'slaveName': 'someSlave',
        'slavePassword': 'somePassword',
    };

    const slaveAuth = {
        'name': 'someSlave',
        'password': 'somePassword'
    };

    const ownedCommitWithWebKit = {
        'WebKit': {'revision': '141978'}
    };

    const anotherownedCommitWithWebKit = {
        'WebKit': {'revision': '141999'}
    };

    const anotherownedCommitWithWebKitAndJavaScriptCore = {
        'WebKit': {'revision': '142000'},
        'JavaScriptCore': {'revision': '142000'}
    };

    const osxCommit = {
        'repository': 'OSX',
        'revision': 'Sierra16D32',
        'order': 1603003200
    };

    const anotherOSXCommit = {
        'repository': 'OSX',
        'revision': 'Sierra16E32',
        'order': 1603003200
    };


    const config = {
        'name': 'OSX',
        'customCommands': [
            {
                'command': ['list', 'all osx 16Dxx builds'],
                'ownedCommitCommand': ['list', 'ownedCommit', 'for', 'revision'],
                'linesToIgnore': '^\\.*$',
                'minRevision': 'Sierra16D0',
                'maxRevision': 'Sierra16D999'
            },
            {
                'command': ['list', 'all osx 16Exx builds'],
                'ownedCommitCommand': ['list', 'ownedCommit', 'for', 'revision'],
                'linesToIgnore': '^\\.*$',
                'minRevision': 'Sierra16E0',
                'maxRevision': 'Sierra16E999'
            }
        ]
    };


    const configWithoutownedCommitCommand = {
        'name': 'OSX',
        'customCommands': [
            {
                'command': ['list', 'all osx 16Dxx builds'],
                'linesToIgnore': '^\\.*$',
                'minRevision': 'Sierra16D0',
                'maxRevision': 'Sierra16D999'
            },
            {
                'command': ['list', 'all osx 16Exx builds'],
                'linesToIgnore': '^\\.*$',
                'minRevision': 'Sierra16E0',
                'maxRevision': 'Sierra16E999'
            }
        ]
    };

    describe('OSBuilderFetcher._computeOrder', () => {
        it('should calculate the right order for a given valid revision', () => {
            const fetcher = new OSBuildFetcher();
            assert.equal(fetcher._computeOrder('Sierra16D32'), 1603003200);
            assert.equal(fetcher._computeOrder('16D321'), 1603032100);
            assert.equal(fetcher._computeOrder('16d321'), 1603032100);
            assert.equal(fetcher._computeOrder('16D321z'), 1603032126);
            assert.equal(fetcher._computeOrder('16d321Z'), 1603032126);
            assert.equal(fetcher._computeOrder('10.12.3 16D32'), 1603003200);
            assert.equal(fetcher._computeOrder('10.12.3 Sierra16D32'), 1603003200);
        });

        it('should throw assertion error when given a invalid revision', () => {
            const fetcher = new OSBuildFetcher();
            assert.throws(() => fetcher._computeOrder('invalid'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder(''), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('16'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('16D'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('123'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('D123'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('123z'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('16[163'), (error) => error.name == 'AssertionError');
            assert.throws(() => fetcher._computeOrder('16D163['), (error) => error.name == 'AssertionError');
        })
    });

    describe('OSBuilderFetcher._commitsForAvailableBuilds', () => {
        it('should only return commits whose orders are higher than specified order', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(null, null, null, MockSubprocess, logger);
            const waitForInvocationPromise = MockSubprocess.waitForInvocation();
            const fetchCommitsPromise = fetchter._commitsForAvailableBuilds('OSX', ['list', 'build1'], '^\\.*$', 1604000000);

            return waitForInvocationPromise.then(() => {
                assert.equal(MockSubprocess.invocations.length, 1);
                assert.deepEqual(MockSubprocess.invocations[0].command, ['list', 'build1']);
                MockSubprocess.invocations[0].resolve('16D321\n16E321z\n\n16F321');
                return fetchCommitsPromise;
            }).then((results) => {
                assert.equal(results.length, 2);
                assert.deepEqual(results[0], {repository: 'OSX', order: 1604032126, revision: '16E321z'});
                assert.deepEqual(results[1], {repository: 'OSX', order: 1605032100, revision: '16F321'});
            });
        });
    });

    describe('OSBuildFetcher._addOwnedCommitsForBuild', () => {
        it('should add owned-commit info for commits', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(null, null, null, MockSubprocess, logger);
            const waitForInvocationPromise = MockSubprocess.waitForInvocation();
            const addownedCommitPromise = fetchter._addOwnedCommitsForBuild([osxCommit, anotherOSXCommit], ['ownedCommit', 'for', 'revision']);

            return waitForInvocationPromise.then(() => {
                assert.equal(MockSubprocess.invocations.length, 1);
                assert.deepEqual(MockSubprocess.invocations[0].command, ['ownedCommit', 'for', 'revision', 'Sierra16D32']);
                MockSubprocess.invocations[0].resolve(JSON.stringify(ownedCommitWithWebKit));
                MockSubprocess.reset();
                return MockSubprocess.waitForInvocation();
            }).then(() => {
                assert.equal(MockSubprocess.invocations.length, 1);
                assert.deepEqual(MockSubprocess.invocations[0].command, ['ownedCommit', 'for', 'revision', 'Sierra16E32']);
                MockSubprocess.invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKit));
                return addownedCommitPromise;
            }).then((results) => {
                assert.equal(results.length, 2);
                assert.equal(results[0]['repository'], osxCommit['repository']);
                assert.equal(results[0]['revision'], osxCommit['revision']);
                assert.deepEqual(results[0]['ownedCommits'], ownedCommitWithWebKit);
                assert.equal(results[1]['repository'], anotherOSXCommit['repository']);
                assert.equal(results[1]['revision'], anotherOSXCommit['revision']);
                assert.deepEqual(results[1]['ownedCommits'], anotherownedCommitWithWebKit);
            });
        });

        it('should fail if the command to get owned-commit info fails', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(null, null, null, MockSubprocess, logger);
            const waitForInvocationPromise = MockSubprocess.waitForInvocation();
            const addownedCommitPromise = fetchter._addOwnedCommitsForBuild([osxCommit], ['ownedCommit', 'for', 'revision'])

            return waitForInvocationPromise.then(() => {
                assert.equal(MockSubprocess.invocations.length, 1);
                assert.deepEqual(MockSubprocess.invocations[0].command, ['ownedCommit', 'for', 'revision', 'Sierra16D32']);
                MockSubprocess.invocations[0].reject('Failed getting owned-commit');

                return addownedCommitPromise.then(() => {
                    assert(false, 'should never be reached');
                }, (error_output) => {
                    assert(error_output);
                    assert.equal(error_output, 'Failed getting owned-commit');
                });
            });
        });


        it('should fail if entries in owned-commits does not contain revision', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(null, null, null, MockSubprocess, logger);
            const waitForInvocationPromise = MockSubprocess.waitForInvocation();
            const addownedCommitPromise = fetchter._addOwnedCommitsForBuild([osxCommit], ['ownedCommit', 'for', 'revision'])

            return waitForInvocationPromise.then(() => {
                assert.equal(MockSubprocess.invocations.length, 1);
                assert.deepEqual(MockSubprocess.invocations[0].command, ['ownedCommit', 'for', 'revision', 'Sierra16D32']);
                MockSubprocess.invocations[0].resolve('{"WebKit":{"RandomKey": "RandomValue"}}');

                return addownedCommitPromise.then(() => {
                    assert(false, 'should never be reached');
                }, (error_output) => {
                    assert(error_output);
                    assert.equal(error_output.name, 'AssertionError');
                });
            });
        })
    })

    describe('OSBuildFetcher.fetchAndReportNewBuilds', () => {
        const invocations = MockSubprocess.invocations;

        beforeEach(function () {
            TestServer.database().connect({keepAlive: true});
        });

        afterEach(function () {
            TestServer.database().disconnect();
        });

        it('should report all build commits with owned-commits', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(config, TestServer.remoteAPI(), slaveAuth, MockSubprocess, logger);
            const db = TestServer.database();
            let fetchAndReportPromise = null;
            let fetchAvailableBuildsPromise = null;

            return addSlaveForReport(emptyReport).then(() => {
                return Promise.all([
                    db.insert('repositories', {'id': 10, 'name': 'OSX'}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D67', 'order': 1603006700, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D68', 'order': 1603006800, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D69', 'order': 1603006900, 'reported': false}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E32', 'order': 1604003200, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33', 'order': 1604003300, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33g', 'order': 1604003307, 'reported': true})]);
            }).then(() => {
                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D68');
                assert.equal(result['commits'][0]['order'], 1603006800);
                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E33g');
                assert.equal(result['commits'][0]['order'], 1604003307);
                const waitForInvocationPromise = MockSubprocess.waitForInvocation();
                fetchAvailableBuildsPromise = fetchter._fetchAvailableBuilds();
                return waitForInvocationPromise;
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Dxx builds']);
                invocations[0].resolve('\n\nSierra16D68\nSierra16D69\n');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16D69']);
                invocations[0].resolve(JSON.stringify(ownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Exx builds']);
                invocations[0].resolve('\n\nSierra16E32\nSierra16E33\nSierra16E33h\nSierra16E34');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E33h']);
                invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E34']);
                invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKitAndJavaScriptCore));
                return fetchAvailableBuildsPromise;
            }).then((results) => {
                assert.equal(results.length, 3);
                MockSubprocess.reset();
                fetchAndReportPromise = fetchter.fetchAndReportNewBuilds();
                return MockSubprocess.waitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Dxx builds']);
                invocations[0].resolve('\n\nSierra16D68\nSierra16D69\n');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16D69']);
                invocations[0].resolve(JSON.stringify(ownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Exx builds']);
                invocations[0].resolve('\n\nSierra16E32\nSierra16E33\nSierra16E33h\nSierra16E34');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E33h']);
                invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKitAndJavaScriptCore));
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E34']);

                return fetchAndReportPromise;
            }).then((result) => {
                assert.equal(result['status'], 'OK');
                return Promise.all([
                    db.selectRows('repositories', {'name': 'WebKit'}),
                    db.selectRows('repositories', {'name': 'JavaScriptCore'}),
                    db.selectRows('commits', {'revision': 'Sierra16D69'}),
                    db.selectRows('commits', {'revision': 'Sierra16E33h'}),
                    db.selectRows('commits', {'revision': 'Sierra16E34'})]);
            }).then((results) => {
                const webkitRepository = results[0];
                const jscRepository = results[1];
                const osxCommit16D69 = results[2];
                const osxCommit16E33h = results[3];
                const osxCommit16E34 = results[4];

                assert.equal(webkitRepository.length, 1);
                assert.equal(webkitRepository[0]['owner'], 10);
                assert.equal(jscRepository.length, 1)
                assert.equal(jscRepository[0]['owner'], 10);

                assert.equal(osxCommit16D69.length, 1);
                assert.equal(osxCommit16D69[0]['repository'], 10);
                assert.equal(osxCommit16D69[0]['order'], 1603006900);

                assert.equal(osxCommit16E33h.length, 1);
                assert.equal(osxCommit16E33h[0]['repository'], 10);
                assert.equal(osxCommit16E33h[0]['order'], 1604003308);

                assert.equal(osxCommit16E34.length, 1);
                assert.equal(osxCommit16E34[0]['repository'], 10);
                assert.equal(osxCommit16E34[0]['order'], 1604003400);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D69');
                assert.equal(result['commits'][0]['order'], 1603006900);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E34');
                assert.equal(result['commits'][0]['order'], 1604003400);
            });
        });

        it('should report commits without owned-commits if "ownedCommitCommand" is not specified in config', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(configWithoutownedCommitCommand, TestServer.remoteAPI(), slaveAuth, MockSubprocess, logger);
            const db = TestServer.database();
            let fetchAndReportPromise = null;
            let fetchAvailableBuildsPromise = null;

            return addSlaveForReport(emptyReport).then(() => {
                return Promise.all([
                    db.insert('repositories', {'id': 10, 'name': 'OSX'}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D67', 'order': 1603006700, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D68', 'order': 1603006800, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D69', 'order': 1603006900, 'reported': false}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E32', 'order': 1604003200, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33', 'order': 1604003300, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33g', 'order': 1604003307, 'reported': true})]);
            }).then(() => {
                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D68');
                assert.equal(result['commits'][0]['order'], 1603006800);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E33g');
                assert.equal(result['commits'][0]['order'], 1604003307);
                const waitForInvocationPromise = MockSubprocess.waitForInvocation();
                fetchAndReportPromise = fetchter.fetchAndReportNewBuilds();
                return waitForInvocationPromise;
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Dxx builds']);
                invocations[0].resolve('\n\nSierra16D68\nSierra16D69\n');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Exx builds']);
                invocations[0].resolve('\n\nSierra16E32\nSierra16E33\nSierra16E33h\nSierra16E34');
                return fetchAndReportPromise;
            }).then((result) => {
                assert.equal(result['status'], 'OK');
                return Promise.all([
                    db.selectRows('repositories', {'name': 'WebKit'}),
                    db.selectRows('repositories', {'name': 'JavaScriptCore'}),
                    db.selectRows('commits', {'revision': 'Sierra16D69'}),
                    db.selectRows('commits', {'revision': 'Sierra16E33h'}),
                    db.selectRows('commits', {'revision': 'Sierra16E34'})]);
            }).then((results) => {
                const webkitRepository = results[0];
                const jscRepository = results[1];
                const osxCommit16D69 = results[2];
                const osxCommit16E33h = results[3];
                const osxCommit16E34 = results[4];

                assert.equal(webkitRepository.length, 0);
                assert.equal(jscRepository.length, 0)

                assert.equal(osxCommit16D69.length, 1);
                assert.equal(osxCommit16D69[0]['repository'], 10);
                assert.equal(osxCommit16D69[0]['order'], 1603006900);

                assert.equal(osxCommit16E33h.length, 1);
                assert.equal(osxCommit16E33h[0]['repository'], 10);
                assert.equal(osxCommit16E33h[0]['order'], 1604003308);

                assert.equal(osxCommit16E34.length, 1);
                assert.equal(osxCommit16E34[0]['repository'], 10);
                assert.equal(osxCommit16E34[0]['order'], 1604003400);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D69');
                assert.equal(result['commits'][0]['order'], 1603006900);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E34');
                assert.equal(result['commits'][0]['order'], 1604003400);
            });
        });

        it('should stop reporting if any custom command fails', () => {
            const logger = new MockLogger;
            const fetchter = new OSBuildFetcher(config, TestServer.remoteAPI(), slaveAuth, MockSubprocess, logger);
            const db = TestServer.database();
            let fetchAndReportPromise = null;

            return addSlaveForReport(emptyReport).then(() => {
                return Promise.all([
                    db.insert('repositories', {'id': 10, 'name': 'OSX'}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D67', 'order': 1603006700, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D68', 'order': 1603006800, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16D69', 'order': 1603006900, 'reported': false}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E32', 'order': 1604003200, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33', 'order': 1604003300, 'reported': true}),
                    db.insert('commits', {'repository': 10, 'revision': 'Sierra16E33g', 'order': 1604003307, 'reported': true})]);
            }).then(() => {
                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D68');
                assert.equal(result['commits'][0]['order'], 1603006800);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E33g');
                assert.equal(result['commits'][0]['order'], 1604003307);

                const waitForInvocationPromise = MockSubprocess.waitForInvocation();
                fetchAndReportPromise = fetchter.fetchAndReportNewBuilds();
                return waitForInvocationPromise;
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Dxx builds']);
                invocations[0].resolve('\n\nSierra16D68\nSierra16D69\n');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16D69']);
                MockSubprocess.invocations[0].resolve(JSON.stringify(ownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'all osx 16Exx builds']);
                invocations[0].resolve('\n\nSierra16E32\nSierra16E33\nSierra16E33h\nSierra16E34');
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E33h']);
                invocations[0].resolve(JSON.stringify(anotherownedCommitWithWebKit));
                return MockSubprocess.resetAndWaitForInvocation();
            }).then(() => {
                assert.equal(invocations.length, 1);
                assert.deepEqual(invocations[0].command, ['list', 'ownedCommit', 'for', 'revision', 'Sierra16E34']);
                invocations[0].reject('Command failed');
                return fetchAndReportPromise.then(() => {
                    assert(false, 'should never be reached');
                }, (error_output) => {
                    assert(error_output);
                    assert.equal(error_output, 'Command failed');
                });
            }).then(() => {
                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1603000000&to=1603099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16D68');
                assert.equal(result['commits'][0]['order'], 1603006800);

                return TestServer.remoteAPI().getJSON('/api/commits/OSX/last-reported?from=1604000000&to=1604099900');
            }).then((result) => {
                assert.equal(result['commits'].length, 1);
                assert.equal(result['commits'][0]['revision'], 'Sierra16E33g');
                assert.equal(result['commits'][0]['order'], 1604003307);
            });
        })
    })
});
