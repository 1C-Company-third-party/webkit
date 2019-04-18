
const crypto = require('crypto');

function addBuilderForReport(report)
{
    return TestServer.database().insert('builders', {
        name: report.builderName,
        password_hash: crypto.createHash('sha256').update(report.builderPassword).digest('hex')
    });
}

function addSlaveForReport(report)
{
    return TestServer.database().insert('build_slaves', {
        name: report.slaveName,
        password_hash: crypto.createHash('sha256').update(report.slavePassword).digest('hex')
    });
}

function prepareServerTest(test)
{
    test.timeout(5000);
    TestServer.inject();

    beforeEach(function () {
        if (typeof(MockData) != 'undefined')
            MockData.resetV3Models();
        TestServer.database().connect({keepAlive: true});
    });

    afterEach(function () {
        TestServer.database().disconnect();
    });
}

function submitReport(report)
{
    return TestServer.database().insert('builders', {
        name: report[0].builderName,
        password_hash: crypto.createHash('sha256').update(report[0].builderPassword).digest('hex')
    }).then(function () {
        return TestServer.remoteAPI().postJSON('/api/report/', report);
    });
}

if (typeof module != 'undefined') {
    module.exports.addBuilderForReport = addBuilderForReport;
    module.exports.addSlaveForReport = addSlaveForReport;
    module.exports.prepareServerTest = prepareServerTest;
    module.exports.submitReport = submitReport;
}
