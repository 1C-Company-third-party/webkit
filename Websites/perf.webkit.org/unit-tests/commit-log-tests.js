'use strict';

const assert = require('assert');

require('../tools/js/v3-models.js');
const MockModels = require('./resources/mock-v3-models.js').MockModels;
const MockRemoteAPI = require('../unit-tests/resources/mock-remote-api.js').MockRemoteAPI;

function webkitCommit()
{
    return new CommitLog(1, {
        repository: MockModels.webkit,
        revision: '200805',
        time: +(new Date('2016-05-13T00:55:57.841344Z')),
    });
}

function oldWebKitCommit()
{
    return new CommitLog(2, {
        repository: MockModels.webkit,
        revision: '200574',
        time: +(new Date('2016-05-09T14:59:23.553767Z')),
    });
}

function gitWebKitCommit()
{
    return new CommitLog(3, {
        repository: MockModels.webkit,
        revision: '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb',
        time: +(new Date('2016-05-13T00:55:57.841344Z')),
    });
}

function oldGitWebKitCommit()
{
    return new CommitLog(4, {
        repository: MockModels.webkit,
        revision: 'ffda14e6db0746d10d0f050907e4a7325851e502',
        time: +(new Date('2016-05-09T14:59:23.553767Z')),
    });
}

function osxCommit()
{
    return new CommitLog(5, {
        repository: MockModels.osx,
        revision: '10.11.4 15E65',
        time: null,
    });
}

function oldOSXCommit()
{
    return new CommitLog(6, {
        repository: MockModels.osx,
        revision: '10.11.3 15D21',
        time: null,
    });
}

function commitWithoutOwnedCommits()
{
    return new CommitLog(6, {
        repository: MockModels.ownerRepository,
        revision: '10.11.4 15E66',
        ownsCommits: false,
        time: null,
    });
}

function ownerCommit()
{
    return new CommitLog(5, {
        repository: MockModels.ownerRepository,
        revision: '10.11.4 15E65',
        ownsCommits: true,
        time: null,
    });
}

function otherOwnerCommit()
{
    return new CommitLog(5, {
        repository: MockModels.ownerRepository,
        revision: '10.11.4 15E66',
        ownsCommits: true,
        time: null,
    });
}

describe('CommitLog', function () {
    MockModels.inject();

    describe('label', function () {
        it('should prefix SVN revision with "r"', function () {
            assert.equal(webkitCommit().label(), 'r200805');
        });

        it('should truncate a Git hash at 8th character', function () {
            assert.equal(gitWebKitCommit().label(), '6f8b0dbb');
        });

        it('should not modify OS X version', function () {
            assert.equal(osxCommit().label(), '10.11.4 15E65');
        });
    });

    describe('title', function () {
        it('should prefix SVN revision with "r"', function () {
            assert.equal(webkitCommit().title(), 'WebKit at r200805');
        });

        it('should truncate a Git hash at 8th character', function () {
            assert.equal(gitWebKitCommit().title(), 'WebKit at 6f8b0dbb');
        });

        it('should not modify OS X version', function () {
            assert.equal(osxCommit().title(), 'OS X at 10.11.4 15E65');
        });
    });

    describe('diff', function () {
        it('should use label() as the label the previous commit is missing', function () {
            assert.deepEqual(webkitCommit().diff(), {
                label: 'r200805',
                url: 'http://trac.webkit.org/changeset/200805',
                repository: MockModels.webkit
            });

            assert.deepEqual(gitWebKitCommit().diff(), {
                label: '6f8b0dbb',
                url: 'http://trac.webkit.org/changeset/6f8b0dbbda95a440503b88db1dd03dad3a7b07fb',
                repository: MockModels.webkit,
            });

            assert.deepEqual(osxCommit().diff(), {
                label: '10.11.4 15E65',
                url: '',
                repository: MockModels.osx,
            });
        });

        it('should use increment the old SVN revision by 1', function () {
            assert.deepEqual(webkitCommit().diff(oldWebKitCommit()), {
                label: 'r200574-r200805',
                url: '',
                repository: MockModels.webkit
            });
        });

        it('should truncate a Git hash at 8th character', function () {
            assert.deepEqual(gitWebKitCommit().diff(oldGitWebKitCommit()), {
                label: 'ffda14e6..6f8b0dbb',
                url: '',
                repository: MockModels.webkit
            });
        });

        it('should surround "-" with spaces', function () {
            assert.deepEqual(osxCommit().diff(oldOSXCommit()), {
                label: '10.11.3 15D21 - 10.11.4 15E65',
                url: '',
                repository: MockModels.osx
            });
        });
    });

    describe('fetchOwnedCommits', () => {
        beforeEach(() => {
            MockRemoteAPI.inject();
        });

        it('should reject if repository of the commit does not own other repositories', () => {
            const commit = osxCommit();
            return commit.fetchOwnedCommits().then(() => {
               assert(false, 'Should not execute this line.');
            }, (error) => {
                assert.equal(error, undefined);
            });
        });

        it('should reject if commit does not own other owned-commits', () => {
            const commit = commitWithoutOwnedCommits();
            return commit.fetchOwnedCommits().then(() => {
                assert(false, 'Should not execute this line.');
            }, (error) => {
                assert.equal(error, undefined);
            });
        });

        it('should return owned-commit for a valid commit revision', () => {
            const fetchingPromise = ownerCommit().fetchOwnedCommits();
            const requests = MockRemoteAPI.requests;
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, '../api/commits/111/owned-commits?owner-revision=10.11.4%2015E65');
            assert.equal(requests[0].method, 'GET');

            requests[0].resolve({commits: [{
                id: 233,
                repository: MockModels.ownedRepository.id(),
                revision: '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb',
                time: +(new Date('2016-05-13T00:55:57.841344Z')),
            }]});
            return fetchingPromise.then((ownedCommits) => {
                assert.equal(ownedCommits.length, 1);
                assert.equal(ownedCommits[0].repository(), MockModels.ownedRepository);
                assert.equal(ownedCommits[0].revision(), '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb');
                assert.equal(ownedCommits[0].id(), 233);
            });
        });

        it('should only fetch owned-commits exactly once', () => {
            const commit = ownerCommit();
            const fetchingPromise = commit.fetchOwnedCommits();
            const requests = MockRemoteAPI.requests;
            let existingOwnedCommits = null;
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, '../api/commits/111/owned-commits?owner-revision=10.11.4%2015E65');
            assert.equal(requests[0].method, 'GET');

            MockRemoteAPI.requests[0].resolve({commits: [{
                id: 233,
                repository: MockModels.ownedRepository.id(),
                revision: '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb',
                time: +(new Date('2016-05-13T00:55:57.841344Z')),
            }]});

            return fetchingPromise.then((ownedCommits) => {
                existingOwnedCommits = ownedCommits;
                assert.equal(ownedCommits.length, 1);
                assert.equal(ownedCommits[0].repository(), MockModels.ownedRepository);
                assert.equal(ownedCommits[0].revision(), '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb');
                assert.equal(ownedCommits[0].id(), 233);
                return commit.fetchOwnedCommits();
            }).then((ownedCommits) => {
                assert.equal(requests.length, 1);
                assert.equal(existingOwnedCommits, ownedCommits);
            });
        });
    });

    describe('diffOwnedCommits', () => {
        beforeEach(() => {
            MockRemoteAPI.reset();
        });

        it('should return difference between 2 owned-commits', () => {
            const oneCommit = ownerCommit();
            const otherCommit = otherOwnerCommit();
            const fetchingPromise = oneCommit.fetchOwnedCommits();
            const requests = MockRemoteAPI.requests;
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, '../api/commits/111/owned-commits?owner-revision=10.11.4%2015E65');
            assert.equal(requests[0].method, 'GET');

            requests[0].resolve({commits: [{
                id: 233,
                repository: MockModels.ownedRepository.id(),
                revision: '6f8b0dbbda95a440503b88db1dd03dad3a7b07fb',
                time: +(new Date('2016-05-13T00:55:57.841344Z')),
            }, {
                id: 299,
                repository: MockModels.webkitGit.id(),
                revision: '04a6c72038f0b771a19248ca2549e1258617b5fc',
                time: +(new Date('2016-05-13T00:55:57.841344Z')),
            }]});

            return fetchingPromise.then(() => {
                const otherFetchingPromise = otherCommit.fetchOwnedCommits();
                assert.equal(requests.length, 2);
                assert.equal(requests[1].url, '../api/commits/111/owned-commits?owner-revision=10.11.4%2015E66');
                assert.equal(requests[1].method, 'GET');

                requests[1].resolve({commits: [{
                    id: 234,
                    repository: MockModels.ownedRepository.id(),
                    revision: 'd5099e03b482abdd77f6c4dcb875afd05bda5ab8',
                    time: +(new Date('2016-05-13T00:55:57.841344Z')),
                }, {
                    id: 299,
                    repository: MockModels.webkitGit.id(),
                    revision: '04a6c72038f0b771a19248ca2549e1258617b5fc',
                    time: +(new Date('2016-05-13T00:55:57.841344Z')),
                }]});

                return otherFetchingPromise;
            }).then(() => {
                const difference = CommitLog.diffOwnedCommits(oneCommit, otherCommit);
                assert.equal(difference.size, 1);
                assert.equal(difference.keys().next().value, MockModels.ownedRepository);
            });

        });
    });
});
