'use strict';

let assert = require('assert');

require('../tools/js/v3-models.js');
let MockRemoteAPI = require('./resources/mock-remote-api.js').MockRemoteAPI;
let MockModels = require('./resources/mock-v3-models.js').MockModels;

let BuildbotBuildEntry = require('../tools/js/buildbot-syncer.js').BuildbotBuildEntry;
let BuildbotSyncer = require('../tools/js/buildbot-syncer.js').BuildbotSyncer;

function sampleiOSConfig()
{
    return {
        'slaveArgument': 'slavename',
        'buildRequestArgument': 'build_request_id',
        'repositoryGroups': {
            'ios-svn-webkit': {
                'repositories': {'WebKit': {}, 'iOS': {}},
                'testProperties': {
                    'desired_image': {'revision': 'iOS'},
                    'opensource': {'revision': 'WebKit'},
                }
            }
        },
        'types': {
            'speedometer': {
                'test': ['Speedometer'],
                'properties': {'test_name': 'speedometer'}
            },
            'jetstream': {
                'test': ['JetStream'],
                'properties': {'test_name': 'jetstream'}
            },
            'dromaeo-dom': {
                'test': ['Dromaeo', 'DOM Core Tests'],
                'properties': {'tests': 'dromaeo-dom'}
            },
        },
        'builders': {
            'iPhone-bench': {
                'builder': 'ABTest-iPhone-RunBenchmark-Tests',
                'properties': {'forcescheduler': 'ABTest-iPhone-RunBenchmark-Tests-ForceScheduler'},
                'slaveList': ['ABTest-iPhone-0'],
            },
            'iPad-bench': {
                'builder': 'ABTest-iPad-RunBenchmark-Tests',
                'properties': {'forcescheduler': 'ABTest-iPad-RunBenchmark-Tests-ForceScheduler'},
                'slaveList': ['ABTest-iPad-0', 'ABTest-iPad-1'],
            },
            'iOS-builder': {
                'builder': 'ABTest-iOS-Builder',
                'properties': {'forcescheduler': 'ABTest-Builder-ForceScheduler'},
            },
        },
        'buildConfigurations': [
            {'builders': ['iOS-builder'], 'platforms': ['iPhone', 'iPad']},
        ],
        'testConfigurations': [
            {'builders': ['iPhone-bench'], 'types': ['speedometer', 'jetstream', 'dromaeo-dom'], 'platforms': ['iPhone']},
            {'builders': ['iPad-bench'], 'types': ['speedometer', 'jetstream'], 'platforms': ['iPad']},
        ]
    };
}

function sampleiOSConfigWithExpansions()
{
    return {
        "triggerableName": "build-webkit-ios",
        "buildRequestArgument": "build-request-id",
        "repositoryGroups": { },
        "types": {
            "iphone-plt": {
                "test": ["PLT-iPhone"],
                "properties": {"test_name": "plt"}
            },
            "ipad-plt": {
                "test": ["PLT-iPad"],
                "properties": {"test_name": "plt"}
            },
            "speedometer": {
                "test": ["Speedometer"],
                "properties": {"tests": "speedometer"}
            },
        },
        "builders": {
            "iphone": {
                "builder": "iPhone AB Tests",
                "properties": {"forcescheduler": "force-iphone-ab-tests"},
            },
            "iphone-2": {
                "builder": "iPhone 2 AB Tests",
                "properties": {"forcescheduler": "force-iphone-2-ab-tests"},
            },
            "ipad": {
                "builder": "iPad AB Tests",
                "properties": {"forcescheduler": "force-ipad-ab-tests"},
            },
        },
        "testConfigurations": [
            {
                "builders": ["iphone", "iphone-2"],
                "platforms": ["iPhone", "iOS 10 iPhone"],
                "types": ["iphone-plt", "speedometer"],
            },
            {
                "builders": ["ipad"],
                "platforms": ["iPad"],
                "types": ["ipad-plt", "speedometer"],
            },
        ]
    }
}

function smallConfiguration()
{
    return {
        'buildRequestArgument': 'id',
        'repositoryGroups': {
            'ios-svn-webkit': {
                'repositories': {'iOS': {}, 'WebKit': {}},
                'testProperties': {
                    'os': {'revision': 'iOS'},
                    'wk': {'revision': 'WebKit'}
                }
            }
        },
        'types': {
            'some-test': {
                'test': ['Some test'],
            }
        },
        'builders': {
            'some-builder': {
                'builder': 'some builder',
            }
        },
        'testConfigurations': [{
            'builders': ['some-builder'],
            'platforms': ['Some platform'],
            'types': ['some-test'],
        }]
    };
}

function smallPendingBuild()
{
    return {
        'builderName': 'some builder',
        'builds': [],
        'properties': [],
        'source': {
            'branch': '',
            'changes': [],
            'codebase': 'WebKit',
            'hasPatch': false,
            'project': '',
            'repository': '',
            'revision': ''
        },
    };
}

function smallInProgressBuild()
{
    return {
        'builderName': 'some builder',
        'builds': [],
        'properties': [],
        'currentStep': { },
        'eta': 123,
        'number': 456,
        'source': {
            'branch': '',
            'changes': [],
            'codebase': 'WebKit',
            'hasPatch': false,
            'project': '',
            'repository': '',
            'revision': ''
        },
    };
}

function smallFinishedBuild()
{
    return {
        'builderName': 'some builder',
        'builds': [],
        'properties': [],
        'currentStep': null,
        'eta': null,
        'number': 789,
        'source': {
            'branch': '',
            'changes': [],
            'codebase': 'WebKit',
            'hasPatch': false,
            'project': '',
            'repository': '',
            'revision': ''
        },
        'times': [0, 1],
    };
}

function createSampleBuildRequest(platform, test)
{
    assert(platform instanceof Platform);
    assert(test instanceof Test);

    const webkit197463 = CommitLog.ensureSingleton('111127', {'id': '111127', 'time': 1456955807334, 'repository': MockModels.webkit, 'revision': '197463'});
    const shared111237 = CommitLog.ensureSingleton('111237', {'id': '111237', 'time': 1456931874000, 'repository': MockModels.sharedRepository, 'revision': '80229'});
    const ios13A452 = CommitLog.ensureSingleton('88930', {'id': '88930', 'time': 0, 'repository': MockModels.ios, 'revision': '13A452'});

    const commitSet = CommitSet.ensureSingleton('4197', {customRoots: [], revisionItems: [{commit: webkit197463}, {commit: shared111237}, {commit: ios13A452}]});

    return BuildRequest.ensureSingleton('16733-' + platform.id(), {'triggerable': MockModels.triggerable,
        repositoryGroup: MockModels.svnRepositoryGroup,
        'commitSet': commitSet, 'status': 'pending', 'platform': platform, 'test': test});
}

function createSampleBuildRequestWithPatch(platform, test, order)
{
    assert(platform instanceof Platform);
    assert(!test || test instanceof Test);

    const webkit197463 = CommitLog.ensureSingleton('111127', {'id': '111127', 'time': 1456955807334, 'repository': MockModels.webkit, 'revision': '197463'});
    const shared111237 = CommitLog.ensureSingleton('111237', {'id': '111237', 'time': 1456931874000, 'repository': MockModels.sharedRepository, 'revision': '80229'});
    const ios13A452 = CommitLog.ensureSingleton('88930', {'id': '88930', 'time': 0, 'repository': MockModels.ios, 'revision': '13A452'});

    const patch = new UploadedFile(453, {'createdAt': new Date('2017-05-01T19:16:53Z'), 'filename': 'patch.dat', 'extension': '.dat', 'author': 'some user',
        size: 534637, sha256: '169463c8125e07c577110fe144ecd63942eb9472d438fc0014f474245e5df8a1'});

    const root = new UploadedFile(456, {'createdAt': new Date('2017-05-01T21:03:27Z'), 'filename': 'root.dat', 'extension': '.dat', 'author': 'some user',
        size: 16452234, sha256: '03eed7a8494ab8794c44b7d4308e55448fc56f4d6c175809ba968f78f656d58d'});

    const commitSet = CommitSet.ensureSingleton('53246456', {customRoots: [root], revisionItems: [{commit: webkit197463, patch, requiresBuild: true}, {commit: shared111237}, {commit: ios13A452}]});

    return BuildRequest.ensureSingleton(`6345645376-${order}`, {'triggerable': MockModels.triggerable,
        repositoryGroup: MockModels.svnRepositoryGroup,
        'commitSet': commitSet, 'status': 'pending', 'platform': platform, 'test': test, 'order': order});
}

function createSampleBuildRequestWithOwnedCommit(platform, test, order)
{
    assert(platform instanceof Platform);
    assert(!test || test instanceof Test);

    const webkit197463 = CommitLog.ensureSingleton('111127', {'id': '111127', 'time': 1456955807334, 'repository': MockModels.webkit, 'revision': '197463'});
    const owner111289 = CommitLog.ensureSingleton('111289', {'id': '111289', 'time': 1456931874000, 'repository': MockModels.ownerRepository, 'revision': 'owner-001'});
    const owned111222 = CommitLog.ensureSingleton('111222', {'id': '111222', 'time': 1456932774000, 'repository': MockModels.ownedRepository, 'revision': 'owned-002'});
    const ios13A452 = CommitLog.ensureSingleton('88930', {'id': '88930', 'time': 0, 'repository': MockModels.ios, 'revision': '13A452'});

    const commitSet = CommitSet.ensureSingleton('53246486', {customRoots: [], revisionItems: [{commit: webkit197463}, {commit: owner111289}, {commit: owned111222, commitOwner: owner111289, requiresBuild: true}, {commit: ios13A452}]});

    return BuildRequest.ensureSingleton(`6345645370-${order}`, {'triggerable': MockModels.triggerable,
        repositoryGroup: MockModels.svnRepositoryWithOwnedRepositoryGroup,
        'commitSet': commitSet, 'status': 'pending', 'platform': platform, 'test': test, 'order': order});
}

function createSampleBuildRequestWithOwnedCommitAndPatch(platform, test, order)
{
    assert(platform instanceof Platform);
    assert(!test || test instanceof Test);

    const webkit197463 = CommitLog.ensureSingleton('111127', {'id': '111127', 'time': 1456955807334, 'repository': MockModels.webkit, 'revision': '197463'});
    const owner111289 = CommitLog.ensureSingleton('111289', {'id': '111289', 'time': 1456931874000, 'repository': MockModels.ownerRepository, 'revision': 'owner-001'});
    const owned111222 = CommitLog.ensureSingleton('111222', {'id': '111222', 'time': 1456932774000, 'repository': MockModels.ownedRepository, 'revision': 'owned-002'});
    const ios13A452 = CommitLog.ensureSingleton('88930', {'id': '88930', 'time': 0, 'repository': MockModels.ios, 'revision': '13A452'});

    const patch = new UploadedFile(453, {'createdAt': new Date('2017-05-01T19:16:53Z'), 'filename': 'patch.dat', 'extension': '.dat', 'author': 'some user',
        size: 534637, sha256: '169463c8125e07c577110fe144ecd63942eb9472d438fc0014f474245e5df8a1'});

    const commitSet = CommitSet.ensureSingleton('53246486', {customRoots: [], revisionItems: [{commit: webkit197463, patch, requiresBuild: true}, {commit: owner111289}, {commit: owned111222, commitOwner: owner111289, requiresBuild: true}, {commit: ios13A452}]});

    return BuildRequest.ensureSingleton(`6345645370-${order}`, {'triggerable': MockModels.triggerable,
        repositoryGroup: MockModels.svnRepositoryWithOwnedRepositoryGroup,
        'commitSet': commitSet, 'status': 'pending', 'platform': platform, 'test': test, 'order': order});
}

function samplePendingBuild(buildRequestId, buildTime, slaveName)
{
    return {
        'builderName': 'ABTest-iPad-RunBenchmark-Tests',
        'builds': [],
        'properties': [
            ['build_request_id', buildRequestId || '16733', 'Force Build Form'],
            ['desired_image', '13A452', 'Force Build Form'],
            ['owner', '<unknown>', 'Force Build Form'],
            ['test_name', 'speedometer', 'Force Build Form'],
            ['reason', 'force build','Force Build Form'],
            ['slavename', slaveName, ''],
            ['scheduler', 'ABTest-iPad-RunBenchmark-Tests-ForceScheduler', 'Scheduler']
        ],
        'source': {
            'branch': '',
            'changes': [],
            'codebase': 'compiler-rt',
            'hasPatch': false,
            'project': '',
            'repository': '',
            'revision': ''
        },
        'submittedAt': buildTime || 1458704983
    };
}

function sampleInProgressBuild(slaveName)
{
    return {
        'blame': [],
        'builderName': 'ABTest-iPad-RunBenchmark-Tests',
        'currentStep': {
            'eta': 0.26548067698460565,
            'expectations': [['output', 845, 1315.0]],
            'hidden': false,
            'isFinished': false,
            'isStarted': true,
            'logs': [['stdio', 'https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/Some%20step/logs/stdio']],
            'name': 'Some step',
            'results': [null,[]],
            'statistics': {},
            'step_number': 1,
            'text': [''],
            'times': [1458718657.581628, null],
            'urls': {}
        },
        'eta': 6497.991612434387,
        'logs': [['stdio','https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/shell/logs/stdio']],
        'number': 614,
        'properties': [
            ['build_request_id', '16733', 'Force Build Form'],
            ['buildername', 'ABTest-iPad-RunBenchmark-Tests', 'Builder'],
            ['buildnumber', 614, 'Build'],
            ['desired_image', '13A452', 'Force Build Form'],
            ['owner', '<unknown>', 'Force Build Form'],
            ['reason', 'force build', 'Force Build Form'],
            ['scheduler', 'ABTest-iPad-RunBenchmark-Tests-ForceScheduler', 'Scheduler'],
            ['slavename', slaveName || 'ABTest-iPad-0', 'BuildSlave'],
        ],
        'reason': 'A build was forced by \'<unknown>\': force build',
        'results': null,
        'slave': 'ABTest-iPad-0',
        'sourceStamps': [{'branch': '', 'changes': [], 'codebase': 'compiler-rt', 'hasPatch': false, 'project': '', 'repository': '', 'revision': ''}],
        'steps': [
            {
                'eta': null,
                'expectations': [['output',2309,2309.0]],
                'hidden': false,
                'isFinished': true,
                'isStarted': true,
                'logs': [['stdio', 'https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/shell/logs/stdio']],
                'name': 'Finished step',
                'results': [0, []],
                'statistics': {},
                'step_number': 0,
                'text': [''],
                'times': [1458718655.419865, 1458718655.453633],
                'urls': {}
            },
            {
                'eta': 0.26548067698460565,
                'expectations': [['output', 845, 1315.0]],
                'hidden': false,
                'isFinished': false,
                'isStarted': true,
                'logs': [['stdio', 'https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/Some%20step/logs/stdio']],
                'name': 'Some step',
                'results': [null,[]],
                'statistics': {},
                'step_number': 1,
                'text': [''],
                'times': [1458718657.581628, null],
                'urls': {}
            },
            {
                'eta': null,
                'expectations': [['output', null, null]],
                'hidden': false,
                'isFinished': false,
                'isStarted': false,
                'logs': [],
                'name': 'Some other step',
                'results': [null, []],
                'statistics': {},
                'step_number': 2,
                'text': [],
                'times': [null, null],
                'urls': {}
            },
        ],
        'text': [],
        'times': [1458718655.415821, null]
    };
}

function sampleFinishedBuild(buildRequestId, slaveName)
{
    return {
        'blame': [],
        'builderName': 'ABTest-iPad-RunBenchmark-Tests',
        'currentStep': null,
        'eta': null,
        'logs': [['stdio','https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/1755/steps/shell/logs/stdio']],
        'number': 1755,
        'properties': [
            ['build_request_id', buildRequestId || '18935', 'Force Build Form'],
            ['buildername', 'ABTest-iPad-RunBenchmark-Tests', 'Builder'],
            ['buildnumber', 1755, 'Build'],
            ['desired_image', '13A452', 'Force Build Form'],
            ['owner', '<unknown>', 'Force Build Form'],
            ['reason', 'force build', 'Force Build Form'],
            ['scheduler', 'ABTest-iPad-RunBenchmark-Tests-ForceScheduler', 'Scheduler'],
            ['slavename', slaveName || 'ABTest-iPad-0', 'BuildSlave'],
        ],
        'reason': 'A build was forced by \'<unknown>\': force build',
        'results': 2,
        'slave': 'ABTest-iPad-0',
        'sourceStamps': [{'branch': '', 'changes': [], 'codebase': 'compiler-rt', 'hasPatch': false, 'project': '', 'repository': '', 'revision': ''}],
        'steps': [
            {
                'eta': null,
                'expectations': [['output',2309,2309.0]],
                'hidden': false,
                'isFinished': true,
                'isStarted': true,
                'logs': [['stdio', 'https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/shell/logs/stdio']],
                'name': 'Finished step',
                'results': [0, []],
                'statistics': {},
                'step_number': 0,
                'text': [''],
                'times': [1458718655.419865, 1458718655.453633],
                'urls': {}
            },
            {
                'eta': null,
                'expectations': [['output', 845, 1315.0]],
                'hidden': false,
                'isFinished': true,
                'isStarted': true,
                'logs': [['stdio', 'https://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614/steps/Some%20step/logs/stdio']],
                'name': 'Some step',
                'results': [null,[]],
                'statistics': {},
                'step_number': 1,
                'text': [''],
                'times': [1458718657.581628, null],
                'urls': {}
            },
            {
                'eta': null,
                'expectations': [['output', null, null]],
                'hidden': false,
                'isFinished': true,
                'isStarted': true,
                'logs': [],
                'name': 'Some other step',
                'results': [null, []],
                'statistics': {},
                'step_number': 2,
                'text': [],
                'times': [null, null],
                'urls': {}
            },
        ],
        'text': [],
        'times': [1458937478.25837, 1458946147.173785]
    };
}

describe('BuildbotSyncer', () => {
    MockModels.inject();
    let requests = MockRemoteAPI.inject('http://build.webkit.org');

    describe('_loadConfig', () => {

        it('should create BuildbotSyncer objects for a configuration that specify all required options', () => {
            assert.equal(BuildbotSyncer._loadConfig(MockRemoteAPI, smallConfiguration()).length, 1);
        });

        it('should throw when some required options are missing', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.builders;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"some-builder" is not a valid builder in the configuration/);
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.types;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"some-test" is not a valid type in the configuration/);
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.testConfigurations[0].builders;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /The test configuration 1 does not specify "builders" as an array/);
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.testConfigurations[0].platforms;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /The test configuration 1 does not specify "platforms" as an array/);
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.testConfigurations[0].types;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /The test configuration 0 does not specify "types" as an array/);
            assert.throws(() => {
                const config = smallConfiguration();
                delete config.buildRequestArgument;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /buildRequestArgument must specify the name of the property used to store the build request ID/);
        });

        it('should throw when a test name is not an array of strings', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.testConfigurations[0].types = 'some test';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /The test configuration 0 does not specify "types" as an array/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.testConfigurations[0].types = [1];
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"1" is not a valid type in the configuration/);
        });

        it('should throw when properties is not an object', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[Object.keys(config.builders)[0]].properties = 'hello';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Build properties should be a dictionary/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[Object.keys(config.types)[0]].properties = 'hello';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Build properties should be a dictionary/);
        });

        it('should throw when testProperties is specifed in a type or a builder', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                const firstType = Object.keys(config.types)[0];
                config.types[firstType].testProperties = {};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Unrecognized parameter "testProperties"/);
            assert.throws(() => {
                const config = smallConfiguration();
                const firstBuilder = Object.keys(config.builders)[0];
                config.builders[firstBuilder].testProperties = {};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Unrecognized parameter "testProperties"/);
        });

        it('should throw when buildProperties is specifed in a type or a builder', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                const firstType = Object.keys(config.types)[0];
                config.types[firstType].buildProperties = {};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Unrecognized parameter "buildProperties"/);
            assert.throws(() => {
                const config = smallConfiguration();
                const firstBuilder = Object.keys(config.builders)[0];
                config.builders[firstBuilder].buildProperties = {};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Unrecognized parameter "buildProperties"/);
        });

        it('should throw when properties for a type is malformed', () => {
            const firstType = Object.keys(smallConfiguration().types)[0];
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[firstType].properties = 'hello';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Build properties should be a dictionary/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[firstType].properties = {'some': {'otherKey': 'some root'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[firstType].properties = {'some': {'otherKey': 'some root'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[firstType].properties = {'some': {'revision': 'WebKit'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.types[firstType].properties = {'some': 1};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, / Build properties "some" specifies a non-string value of type "object"/);
        });

        it('should throw when properties for a builder is malformed', () => {
            const firstBuilder = Object.keys(smallConfiguration().builders)[0];
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[firstBuilder].properties = 'hello';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Build properties should be a dictionary/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[firstBuilder].properties = {'some': {'otherKey': 'some root'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[firstBuilder].properties = {'some': {'otherKey': 'some root'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[firstBuilder].properties = {'some': {'revision': 'WebKit'}};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.builders[firstBuilder].properties = {'some': 1};
                BuildbotSyncer._loadConfig(RemoteAPI, config);
            }, /Build properties "some" specifies a non-string value of type "object"/);
        });

        it('should create BuildbotSyncer objects for valid configurations', () => {
            let syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            assert.equal(syncers.length, 3);
            assert.ok(syncers[0] instanceof BuildbotSyncer);
            assert.ok(syncers[1] instanceof BuildbotSyncer);
            assert.ok(syncers[2] instanceof BuildbotSyncer);
        });

        it('should parse builder names correctly', () => {
            let syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            assert.equal(syncers[0].builderName(), 'ABTest-iPhone-RunBenchmark-Tests');
            assert.equal(syncers[1].builderName(), 'ABTest-iPad-RunBenchmark-Tests');
            assert.equal(syncers[2].builderName(), 'ABTest-iOS-Builder');
        });

        it('should parse test configurations with build configurations correctly', () => {
            let syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());

            let configurations = syncers[0].testConfigurations();
            assert(syncers[0].isTester());
            assert.equal(configurations.length, 3);
            assert.equal(configurations[0].platform, MockModels.iphone);
            assert.equal(configurations[0].test, MockModels.speedometer);
            assert.equal(configurations[1].platform, MockModels.iphone);
            assert.equal(configurations[1].test, MockModels.jetstream);
            assert.equal(configurations[2].platform, MockModels.iphone);
            assert.equal(configurations[2].test, MockModels.domcore);
            assert.deepEqual(syncers[0].buildConfigurations(), []);

            configurations = syncers[1].testConfigurations();
            assert(syncers[1].isTester());
            assert.equal(configurations.length, 2);
            assert.equal(configurations[0].platform, MockModels.ipad);
            assert.equal(configurations[0].test, MockModels.speedometer);
            assert.equal(configurations[1].platform, MockModels.ipad);
            assert.equal(configurations[1].test, MockModels.jetstream);
            assert.deepEqual(syncers[1].buildConfigurations(), []);

            assert(!syncers[2].isTester());
            assert.deepEqual(syncers[2].testConfigurations(), []);
            configurations = syncers[2].buildConfigurations();
            assert.equal(configurations.length, 2);
            assert.equal(configurations[0].platform, MockModels.iphone);
            assert.equal(configurations[0].test, null);
            assert.equal(configurations[1].platform, MockModels.ipad);
            assert.equal(configurations[1].test, null);
        });

        it('should throw when a build configuration use the same builder as a test configuration', () => {
            assert.throws(() => {
                const config = sampleiOSConfig();
                config.buildConfigurations[0].builders = config.testConfigurations[0].builders;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            });
        });

        it('should parse test configurations with types and platforms expansions correctly', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfigWithExpansions());

            assert.equal(syncers.length, 3);

            let configurations = syncers[0].testConfigurations();
            assert.equal(configurations.length, 4);
            assert.equal(configurations[0].platform, MockModels.iphone);
            assert.equal(configurations[0].test, MockModels.iPhonePLT);
            assert.equal(configurations[1].platform, MockModels.iphone);
            assert.equal(configurations[1].test, MockModels.speedometer);
            assert.equal(configurations[2].platform, MockModels.iOS10iPhone);
            assert.equal(configurations[2].test, MockModels.iPhonePLT);
            assert.equal(configurations[3].platform, MockModels.iOS10iPhone);
            assert.equal(configurations[3].test, MockModels.speedometer);
            assert.deepEqual(syncers[0].buildConfigurations(), []);

            configurations = syncers[1].testConfigurations();
            assert.equal(configurations.length, 4);
            assert.equal(configurations[0].platform, MockModels.iphone);
            assert.equal(configurations[0].test, MockModels.iPhonePLT);
            assert.equal(configurations[1].platform, MockModels.iphone);
            assert.equal(configurations[1].test, MockModels.speedometer);
            assert.equal(configurations[2].platform, MockModels.iOS10iPhone);
            assert.equal(configurations[2].test, MockModels.iPhonePLT);
            assert.equal(configurations[3].platform, MockModels.iOS10iPhone);
            assert.equal(configurations[3].test, MockModels.speedometer);
            assert.deepEqual(syncers[1].buildConfigurations(), []);

            configurations = syncers[2].testConfigurations();
            assert.equal(configurations.length, 2);
            assert.equal(configurations[0].platform, MockModels.ipad);
            assert.equal(configurations[0].test, MockModels.iPadPLT);
            assert.equal(configurations[1].platform, MockModels.ipad);
            assert.equal(configurations[1].test, MockModels.speedometer);
            assert.deepEqual(syncers[2].buildConfigurations(), []);
        });

        it('should throw when repositoryGroups is not an object', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = 1;
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /repositoryGroups must specify a dictionary from the name to its definition/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = 'hello';
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /repositoryGroups must specify a dictionary from the name to its definition/);
        });

        it('should throw when a repository group does not specify a dictionary of repositories', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {testProperties: {}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" does not specify a dictionary of repositories/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: 1}, testProperties: {}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" does not specify a dictionary of repositories/);
        });

        it('should throw when a repository group specifies an empty dictionary', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {}, testProperties: {}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" does not specify any repository/);
        });

        it('should throw when a repository group specifies an invalid repository name', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'InvalidRepositoryName': {}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"InvalidRepositoryName" is not a valid repository name/);
        });

        it('should throw when a repository group specifies a repository with a non-dictionary value', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': 1}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"WebKit" specifies a non-dictionary value/);
        });

        it('should throw when the description of a repository group is not a string', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, description: 1}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" have an invalid description/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, description: [1, 2]}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" have an invalid description/);
        });

        it('should throw when a repository group does not specify a dictionary of properties', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, testProperties: 1}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies the test configurations with an invalid type/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, testProperties: 'hello'}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies the test configurations with an invalid type/);
        });

        it('should throw when a repository group refers to a non-existent repository in the properties dictionary', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, testProperties: {'wk': {revision: 'InvalidRepository'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" an invalid repository "InvalidRepository"/);
        });

        it('should throw when a repository group refers to a repository which is not listed in the list of repositories', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {repositories: {'WebKit': {}}, testProperties: {'os': {revision: 'iOS'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" an invalid repository "iOS"/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'wk': {revision: 'WebKit'}, 'install-roots': {'roots': {}}},
                    buildProperties: {'os': {revision: 'iOS'}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" an invalid repository "iOS"/);
        });

        it('should throw when a repository group refers to a repository in building a patch which does not accept a patch', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}, 'iOS': {}},
                    testProperties: {'wk': {revision: 'WebKit'}, 'ios': {revision: 'iOS'}, 'install-roots': {'roots': {}}},
                    buildProperties: {'wk': {revision: 'WebKit'}, 'ios': {revision: 'iOS'}, 'wk-patch': {patch: 'iOS'}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies a patch for "iOS" but it does not accept a patch/);
        });

        it('should throw when a repository group specifies a patch without specifying a revision', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'wk': {revision: 'WebKit'}, 'install-roots': {'roots': {}}},
                    buildProperties: {'wk-patch': {patch: 'WebKit'}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies a patch for "WebKit" but does not specify a revision/);
        });

        it('should throw when a repository group does not use a listed repository', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {}}, testProperties: {}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" does not use some of the repositories listed in testing/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'wk': {revision: 'WebKit'}, 'install-roots': {'roots': {}}},
                    buildProperties: {},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" does not use some of the repositories listed in building a patch/);
        });

        it('should throw when a repository group specifies non-boolean value to acceptsRoots', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {}}, 'testProperties': {'webkit': {'revision': 'WebKit'}}, acceptsRoots: 1}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" contains invalid acceptsRoots value:/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {}}, 'testProperties': {'webkit': {'revision': 'WebKit'}}, acceptsRoots: []}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" contains invalid acceptsRoots value:/);
        });

        it('should throw when a repository group specifies non-boolean value to acceptsPatch', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {acceptsPatch: 1}}, 'testProperties': {'webkit': {'revision': 'WebKit'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"WebKit" contains invalid acceptsPatch value:/);
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {acceptsPatch: []}}, 'testProperties': {'webkit': {'revision': 'WebKit'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /"WebKit" contains invalid acceptsPatch value:/);
        });

        it('should throw when a repository group specifies a patch in testProperties', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {'repositories': {'WebKit': {acceptsPatch: true}},
                    'testProperties': {'webkit': {'revision': 'WebKit'}, 'webkit-patch': {'patch': 'WebKit'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies a patch for "WebKit" in the properties for testing/);
        });

        it('should throw when a repository group specifies roots in buildProperties', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'webkit': {revision: 'WebKit'}, 'install-roots': {'roots': {}}},
                    buildProperties: {'webkit': {revision: 'WebKit'}, 'patch': {patch: 'WebKit'}, 'install-roots': {roots: {}}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies roots in the properties for building/);
        });

        it('should throw when a repository group that does not accept roots specifies roots in testProperties', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {}},
                    testProperties: {'webkit': {'revision': 'WebKit'}, 'install-roots': {'roots': {}}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies roots in a property but it does not accept roots/);
        });

        it('should throw when a repository group specifies buildProperties but does not accept roots', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'webkit': {revision: 'WebKit'}},
                    buildProperties: {'webkit': {revision: 'WebKit'}, 'webkit-patch': {patch: 'WebKit'}}}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies the properties for building but does not accept roots in testing/);
        });

        it('should throw when a repository group specifies buildProperties but does not accept any patch', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {}},
                    testProperties: {'webkit': {'revision': 'WebKit'}, 'install-roots': {'roots': {}}},
                    buildProperties: {'webkit': {'revision': 'WebKit'}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" specifies the properties for building but does not accept any patches/);
        });

        it('should throw when a repository group accepts roots but does not specify roots in testProperties', () => {
            assert.throws(() => {
                const config = smallConfiguration();
                config.repositoryGroups = {'some-group': {
                    repositories: {'WebKit': {acceptsPatch: true}},
                    testProperties: {'webkit': {revision: 'WebKit'}},
                    buildProperties: {'webkit': {revision: 'WebKit'}, 'webkit-patch': {patch: 'WebKit'}},
                    acceptsRoots: true}};
                BuildbotSyncer._loadConfig(MockRemoteAPI, config);
            }, /Repository group "some-group" accepts roots but does not specify roots in testProperties/);
        });
    });

    describe('_propertiesForBuildRequest', () => {
        it('should include all properties specified in a given configuration', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            const properties = syncers[0]._propertiesForBuildRequest(request, [request]);
            assert.deepEqual(Object.keys(properties).sort(), ['build_request_id', 'desired_image', 'forcescheduler', 'opensource', 'test_name']);
        });

        it('should preserve non-parametric property values', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            let request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            let properties = syncers[0]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['test_name'], 'speedometer');
            assert.equal(properties['forcescheduler'], 'ABTest-iPhone-RunBenchmark-Tests-ForceScheduler');

            request = createSampleBuildRequest(MockModels.ipad, MockModels.jetstream);
            properties = syncers[1]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['test_name'], 'jetstream');
            assert.equal(properties['forcescheduler'], 'ABTest-iPad-RunBenchmark-Tests-ForceScheduler');
        });

        it('should resolve "root"', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            const properties = syncers[0]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['desired_image'], '13A452');
        });

        it('should resolve "revision"', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            const properties = syncers[0]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['opensource'], '197463');
        });

        it('should resolve "patch"', () => {
            const config = sampleiOSConfig();
            config.repositoryGroups['ios-svn-webkit'] = {
                'repositories': {'WebKit': {'acceptsPatch': true}, 'Shared': {}, 'iOS': {}},
                'testProperties': {
                    'os': {'revision': 'iOS'},
                    'webkit': {'revision': 'WebKit'},
                    'shared': {'revision': 'Shared'},
                    'roots': {'roots': {}},
                },
                'buildProperties': {
                    'webkit': {'revision': 'WebKit'},
                    'webkit-patch': {'patch': 'WebKit'},
                    'checkbox': {'ifRepositorySet': ['WebKit'], 'value': 'build-webkit'},
                    'shared': {'revision': 'Shared'},
                },
                'acceptsRoots': true,
            };
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, config);
            const request = createSampleBuildRequestWithPatch(MockModels.iphone, null, -1);
            const properties = syncers[2]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['webkit-patch'], 'http://build.webkit.org/api/uploaded-file/453.dat');
            assert.equal(properties['checkbox'], 'build-webkit');
        });

        it('should resolve "ifBuilt"', () => {
            const config = sampleiOSConfig();
            config.repositoryGroups['ios-svn-webkit'] = {
                'repositories': {'WebKit': {}, 'Shared': {}, 'iOS': {}},
                'testProperties': {
                    'os': {'revision': 'iOS'},
                    'webkit': {'revision': 'WebKit'},
                    'shared': {'revision': 'Shared'},
                    'roots': {'roots': {}},
                    'test-custom-build': {'ifBuilt': ''},
                    'has-built-patch': {'ifBuilt': 'true'},
                },
                'acceptsRoots': true,
            };
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, config);
            const requestToBuild = createSampleBuildRequestWithPatch(MockModels.iphone, null, -1);
            const requestToTest = createSampleBuildRequestWithPatch(MockModels.iphone, MockModels.speedometer, 0);
            const otherRequestToTest = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);

            let properties = syncers[0]._propertiesForBuildRequest(requestToTest, [requestToTest]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['roots'], '[{"url":"http://build.webkit.org/api/uploaded-file/456.dat"}]');
            assert.equal(properties['test-custom-build'], undefined);
            assert.equal(properties['has-built-patch'], undefined);

            properties = syncers[0]._propertiesForBuildRequest(requestToTest, [requestToBuild, requestToTest]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['roots'], '[{"url":"http://build.webkit.org/api/uploaded-file/456.dat"}]');
            assert.equal(properties['test-custom-build'], '');
            assert.equal(properties['has-built-patch'], 'true');

            properties = syncers[0]._propertiesForBuildRequest(otherRequestToTest, [requestToBuild, otherRequestToTest, requestToTest]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['roots'], undefined);
            assert.equal(properties['test-custom-build'], undefined);
            assert.equal(properties['has-built-patch'], undefined);

        });

        it('should resolve "ifRepositorySet" and "requiresBuild"', () => {
            const config = sampleiOSConfig();
            config.repositoryGroups['ios-svn-webkit-with-owned-commit'] = {
                'repositories': {'WebKit': {'acceptsPatch': true}, 'Owner Repository': {}, 'iOS': {}},
                'testProperties': {
                    'os': {'revision': 'iOS'},
                    'webkit': {'revision': 'WebKit'},
                    'owner-repo': {'revision': 'Owner Repository'},
                    'roots': {'roots': {}},
                },
                'buildProperties': {
                    'webkit': {'revision': 'WebKit'},
                    'webkit-patch': {'patch': 'WebKit'},
                    'owner-repo': {'revision': 'Owner Repository'},
                    'checkbox': {'ifRepositorySet': ['WebKit'], 'value': 'build-webkit'},
                    'owned-commits': {'ownedRevisions': 'Owner Repository'}
                },
                'acceptsRoots': true,
            };
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, config);
            const request = createSampleBuildRequestWithOwnedCommit(MockModels.iphone, null, -1);
            const properties = syncers[2]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['owner-repo'], 'owner-001');
            assert.equal(properties['checkbox'], undefined);
            assert.deepEqual(JSON.parse(properties['owned-commits']), {'Owner Repository': [{revision: 'owned-002', repository: 'Owned Repository', ownerRevision: 'owner-001'}]});
        });

        it('should resolve "patch", "ifRepositorySet" and "requiresBuild"', () => {

            const config = sampleiOSConfig();
            config.repositoryGroups['ios-svn-webkit-with-owned-commit'] = {
                'repositories': {'WebKit': {'acceptsPatch': true}, 'Owner Repository': {}, 'iOS': {}},
                'testProperties': {
                    'os': {'revision': 'iOS'},
                    'webkit': {'revision': 'WebKit'},
                    'owner-repo': {'revision': 'Owner Repository'},
                    'roots': {'roots': {}},
                },
                'buildProperties': {
                    'webkit': {'revision': 'WebKit'},
                    'webkit-patch': {'patch': 'WebKit'},
                    'owner-repo': {'revision': 'Owner Repository'},
                    'checkbox': {'ifRepositorySet': ['WebKit'], 'value': 'build-webkit'},
                    'owned-commits': {'ownedRevisions': 'Owner Repository'}
                },
                'acceptsRoots': true,
            };
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, config);
            const request = createSampleBuildRequestWithOwnedCommitAndPatch(MockModels.iphone, null, -1);
            const properties = syncers[2]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['webkit'], '197463');
            assert.equal(properties['owner-repo'], 'owner-001');
            assert.equal(properties['checkbox'], 'build-webkit');
            assert.equal(properties['webkit-patch'], 'http://build.webkit.org/api/uploaded-file/453.dat');
            assert.deepEqual(JSON.parse(properties['owned-commits']), {'Owner Repository': [{revision: 'owned-002', repository: 'Owned Repository', ownerRevision: 'owner-001'}]});
        });

        it('should set the property for the build request id', () => {
            const syncers = BuildbotSyncer._loadConfig(RemoteAPI, sampleiOSConfig());
            const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            const properties = syncers[0]._propertiesForBuildRequest(request, [request]);
            assert.equal(properties['build_request_id'], request.id());
        });
    });

    describe('pullBuildbot', () => {
        it('should fetch pending builds from the right URL', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];
            assert.equal(syncer.builderName(), 'ABTest-iPad-RunBenchmark-Tests');
            let expectedURL = '/json/builders/ABTest-iPad-RunBenchmark-Tests/pendingBuilds';
            assert.equal(syncer.pathForPendingBuildsJSON(), expectedURL);
            syncer.pullBuildbot();
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, expectedURL);
        });

        it('should fetch recent builds once pending builds have been fetched', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];
            assert.equal(syncer.builderName(), 'ABTest-iPad-RunBenchmark-Tests');

            syncer.pullBuildbot(1);
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, '/json/builders/ABTest-iPad-RunBenchmark-Tests/pendingBuilds');
            requests[0].resolve([]);
            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                assert.equal(requests[1].url, '/json/builders/ABTest-iPad-RunBenchmark-Tests/builds/?select=-1');
            });
        });

        it('should fetch the right number of recent builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            syncer.pullBuildbot(3);
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, '/json/builders/ABTest-iPad-RunBenchmark-Tests/pendingBuilds');
            requests[0].resolve([]);
            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                assert.equal(requests[1].url, '/json/builders/ABTest-iPad-RunBenchmark-Tests/builds/?select=-1&select=-2&select=-3');
            });
        });

        it('should create BuildbotBuildEntry for pending builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];
            let promise = syncer.pullBuildbot();
            requests[0].resolve([samplePendingBuild()]);
            return promise.then((entries) => {
                assert.equal(entries.length, 1);
                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.ok(!entry.buildNumber());
                assert.ok(!entry.slaveName());
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/');
            });
        });

        it('should create BuildbotBuildEntry for in-progress builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(1);
            assert.equal(requests.length, 1);
            requests[0].resolve([]);
            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-1]: sampleInProgressBuild()});
                return promise;
            }).then((entries) => {
                assert.equal(entries.length, 1);
                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 614);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(!entry.isPending());
                assert.ok(entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614');
            });
        });

        it('should create BuildbotBuildEntry for finished builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(1);
            assert.equal(requests.length, 1);
            requests[0].resolve([]);
            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-1]: sampleFinishedBuild()});
                return promise;
            }).then((entries) => {
                assert.deepEqual(entries.length, 1);
                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 1755);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 18935);
                assert.ok(!entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/1755');
            });
        });

        it('should create BuildbotBuildEntry for mixed pending, in-progress, finished, and missing builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(5);
            assert.equal(requests.length, 1);

            requests[0].resolve([samplePendingBuild(123)]);

            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-1]: sampleFinishedBuild(), [-2]: {'error': 'Not available'}, [-4]: sampleInProgressBuild()});
                return promise;
            }).then((entries) => {
                assert.deepEqual(entries.length, 3);

                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), null);
                assert.equal(entry.slaveName(), null);
                assert.equal(entry.buildRequestId(), 123);
                assert.ok(entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/');

                entry = entries[1];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 614);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(!entry.isPending());
                assert.ok(entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614');

                entry = entries[2];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 1755);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 18935);
                assert.ok(!entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/1755');
            });
        });

        it('should sort BuildbotBuildEntry by order', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(5);
            assert.equal(requests.length, 1);

            requests[0].resolve([samplePendingBuild(456, 2), samplePendingBuild(123, 1)]);

            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-3]: sampleFinishedBuild(), [-1]: {'error': 'Not available'}, [-2]: sampleInProgressBuild()});
                return promise;
            }).then((entries) => {
                assert.deepEqual(entries.length, 4);

                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), null);
                assert.equal(entry.slaveName(), null);
                assert.equal(entry.buildRequestId(), 123);
                assert.ok(entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/');

                entry = entries[1];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), null);
                assert.equal(entry.slaveName(), null);
                assert.equal(entry.buildRequestId(), 456);
                assert.ok(entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/');

                entry = entries[2];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 614);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(!entry.isPending());
                assert.ok(entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614');

                entry = entries[3];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 1755);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 18935);
                assert.ok(!entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/1755');
            });
        });

        it('should override BuildbotBuildEntry for pending builds by in-progress builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(5);
            assert.equal(requests.length, 1);

            requests[0].resolve([samplePendingBuild()]);

            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-1]: sampleInProgressBuild()});
                return promise;
            }).then((entries) => {
                assert.equal(entries.length, 1);

                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 614);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(!entry.isPending());
                assert.ok(entry.isInProgress());
                assert.ok(!entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/614');
            });
        });

        it('should override BuildbotBuildEntry for pending builds by finished builds', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            let promise = syncer.pullBuildbot(5);
            assert.equal(requests.length, 1);

            requests[0].resolve([samplePendingBuild()]);

            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve({[-1]: sampleFinishedBuild(16733)});
                return promise;
            }).then((entries) => {
                assert.equal(entries.length, 1);

                let entry = entries[0];
                assert.ok(entry instanceof BuildbotBuildEntry);
                assert.equal(entry.buildNumber(), 1755);
                assert.equal(entry.slaveName(), 'ABTest-iPad-0');
                assert.equal(entry.buildRequestId(), 16733);
                assert.ok(!entry.isPending());
                assert.ok(!entry.isInProgress());
                assert.ok(entry.hasFinished());
                assert.equal(entry.url(), 'http://build.webkit.org/builders/ABTest-iPad-RunBenchmark-Tests/builds/1755');
            });
        });
    });

    describe('scheduleRequest', () => {
        it('should schedule a build request on a specified slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[0];

            const waitForRequest = MockRemoteAPI.waitForRequest();
            const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
            syncer.scheduleRequest(request, [request], 'some-slave');
            return waitForRequest.then(() => {
                assert.equal(requests.length, 1);
                assert.equal(requests[0].url, '/builders/ABTest-iPhone-RunBenchmark-Tests/force');
                assert.equal(requests[0].method, 'POST');
                assert.deepEqual(requests[0].data, {
                    'build_request_id': '16733-' + MockModels.iphone.id(),
                    'desired_image': '13A452',
                    "opensource": "197463",
                    'forcescheduler': 'ABTest-iPhone-RunBenchmark-Tests-ForceScheduler',
                    'slavename': 'some-slave',
                    'test_name': 'speedometer'
                });
            });
        });
    });

    describe('scheduleRequestInGroupIfAvailable', () => {

        function pullBuildbotWithAssertion(syncer, pendingBuilds, inProgressAndFinishedBuilds)
        {
            const promise = syncer.pullBuildbot(5);
            assert.equal(requests.length, 1);
            requests[0].resolve(pendingBuilds);
            return MockRemoteAPI.waitForRequest().then(() => {
                assert.equal(requests.length, 2);
                requests[1].resolve(inProgressAndFinishedBuilds);
                requests.length = 0;
                return promise;
            });
        }

        it('should schedule a build if builder has no builds if slaveList is not specified', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, smallConfiguration())[0];

            return pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                const request = createSampleBuildRequest(MockModels.somePlatform, MockModels.someTest);
                syncer.scheduleRequestInGroupIfAvailable(request, [request]);
                assert.equal(requests.length, 1);
                assert.equal(requests[0].url, '/builders/some%20builder/force');
                assert.equal(requests[0].method, 'POST');
                assert.deepEqual(requests[0].data, {id: '16733-' + MockModels.somePlatform.id(), 'os': '13A452', 'wk': '197463'});
            });
        });

        it('should schedule a build if builder only has finished builds if slaveList is not specified', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, smallConfiguration())[0];

            return pullBuildbotWithAssertion(syncer, [], {[-1]: smallFinishedBuild()}).then(() => {
                const request = createSampleBuildRequest(MockModels.somePlatform, MockModels.someTest);
                syncer.scheduleRequestInGroupIfAvailable(request, [request]);
                assert.equal(requests.length, 1);
                assert.equal(requests[0].url, '/builders/some%20builder/force');
                assert.equal(requests[0].method, 'POST');
                assert.deepEqual(requests[0].data, {id: '16733-' + MockModels.somePlatform.id(), 'os': '13A452', 'wk': '197463'});
            });
        });

        it('should not schedule a build if builder has a pending build if slaveList is not specified', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, smallConfiguration())[0];

            return pullBuildbotWithAssertion(syncer, [smallPendingBuild()], {}).then(() => {
                syncer.scheduleRequestInGroupIfAvailable(createSampleBuildRequest(MockModels.somePlatform, MockModels.someTest));
                assert.equal(requests.length, 0);
            });
        });

        it('should schedule a build if builder does not have pending or completed builds on the matching slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[0];

            return pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                const request = createSampleBuildRequest(MockModels.iphone, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
                assert.equal(requests[0].url, '/builders/ABTest-iPhone-RunBenchmark-Tests/force');
                assert.equal(requests[0].method, 'POST');
            });
        });

        it('should schedule a build if builder only has finished builds on the matching slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            pullBuildbotWithAssertion(syncer, [], {[-1]: sampleFinishedBuild()}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
                assert.equal(requests[0].url, '/builders/ABTest-iPad-RunBenchmark-Tests/force');
                assert.equal(requests[0].method, 'POST');
            });
        });

        it('should not schedule a build if builder has a pending build on the maching slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            pullBuildbotWithAssertion(syncer, [samplePendingBuild()], {}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 0);
            });
        });

        it('should schedule a build if builder only has a pending build on a non-maching slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            return pullBuildbotWithAssertion(syncer, [samplePendingBuild(1, 1, 'another-slave')], {}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
            });
        });

        it('should schedule a build if builder only has an in-progress build on the matching slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            return pullBuildbotWithAssertion(syncer, [], {[-1]: sampleInProgressBuild()}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
            });
        });

        it('should schedule a build if builder has an in-progress build on another slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            return pullBuildbotWithAssertion(syncer, [], {[-1]: sampleInProgressBuild('other-slave')}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
            });
        });

        it('should not schedule a build if the request does not match any configuration', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[0];

            return pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 0);
            });
        });

        it('should not schedule a build if a new request had been submitted to the same slave', (done) => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                let request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequest(request, [request], 'ABTest-iPad-0');
                request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequest(request, [request], 'ABTest-iPad-1');
            }).then(() => {
                assert.equal(requests.length, 2);
                const request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
            }).then(() => {
                assert.equal(requests.length, 2);
                done();
            }).catch(done);
        });

        it('should schedule a build if a new request had been submitted to another slave', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, sampleiOSConfig())[1];

            return pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                let request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer);
                syncer.scheduleRequest(request, [request], 'ABTest-iPad-0');
                assert.equal(requests.length, 1);
                request = createSampleBuildRequest(MockModels.ipad, MockModels.speedometer)
                syncer.scheduleRequestInGroupIfAvailable(request, [request], 'ABTest-iPad-1');
                assert.equal(requests.length, 2);
            });
        });

        it('should not schedule a build if a new request had been submitted to the same builder without slaveList', () => {
            let syncer = BuildbotSyncer._loadConfig(MockRemoteAPI, smallConfiguration())[0];

            return pullBuildbotWithAssertion(syncer, [], {}).then(() => {
                let request = createSampleBuildRequest(MockModels.somePlatform, MockModels.someTest);
                syncer.scheduleRequest(request, [request], null);
                assert.equal(requests.length, 1);
                request = createSampleBuildRequest(MockModels.somePlatform, MockModels.someTest);
                syncer.scheduleRequestInGroupIfAvailable(request, [request], null);
                assert.equal(requests.length, 1);
            });
        });
    });
});
