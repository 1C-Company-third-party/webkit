
// A point in a plot.
function PerfTestResult(runs, result, associatedBuild) {
    this.metric = function () { return runs.metric(); }
    this.values = function () { return result.values ? result.values.map(function (value) { return runs.scalingFactor() * value; }) : undefined; }
    this.mean = function () { return runs.scalingFactor() * result.mean; }
    this.unscaledMean = function () { return result.mean; }
    this.confidenceIntervalDelta = function () {
        return runs.scalingFactor() * this.unscaledConfidenceIntervalDelta();
    }
    this.unscaledConfidenceIntervalDelta = function (defaultValue) {
        var delta = Statistics.confidenceIntervalDelta(0.95, result.iterationCount, result.sum, result.squareSum);
        if (isNaN(delta) && defaultValue !== undefined)
            return defaultValue;
        return delta;
    }
    this.isInUnscaledInterval = function (min, max) {
        var mean = this.unscaledMean();
        var delta = this.unscaledConfidenceIntervalDelta(0);
        return min <= mean - delta && mean + delta <= max;
    }
    this.isBetterThan = function(other) { return runs.smallerIsBetter() == (this.mean() < other.mean()); }
    this.relativeDifference = function(other) { return (other.mean() - this.mean()) / this.mean(); }
    this.formattedRelativeDifference = function (other) { return Math.abs(this.relativeDifference(other) * 100).toFixed(2) + '%'; }
    this.formattedProgressionOrRegression = function (previousResult) {
        return previousResult.formattedRelativeDifference(this) + ' ' + (this.isBetterThan(previousResult) ? 'better' : 'worse');
    }
    this.isStatisticallySignificant = function (other) {
        var diff = Math.abs(other.mean() - this.mean());
        return diff > this.confidenceIntervalDelta() && diff > other.confidenceIntervalDelta();
    }
    this.build = function () { return associatedBuild; }
    this.label = function (previousResult) {
        var mean = this.mean();
        var label = mean.toPrecision(4) + ' ' + runs.unit();

        var delta = this.confidenceIntervalDelta();
        if (delta) {
            var percentageStdev = delta * 100 / mean;
            label += ' &plusmn; ' + percentageStdev.toFixed(2) + '%';
        }

        if (previousResult)
            label += ' (' + this.formattedProgressionOrRegression(previousResult) + ')';

        return label;
    }
}

function TestBuild(repositories, builders, platform, rawRun) {
    const revisions = rawRun.revisions;
    var maxTime = 0;
    var revisionCount = 0;
    for (var repositoryId in revisions) {
        maxTime = Math.max(maxTime, revisions[repositoryId][1]); // Revision is an pair (revision, time)
        revisionCount++;
    }
    if (!maxTime)
        maxTime = rawRun.buildTime;
    maxTime = TestBuild.UTCtoPST(maxTime);
    var maxTimeString;
    var buildTime = TestBuild.UTCtoPST(rawRun.buildTime);
    var buildTimeString;

    this.time = function () { return maxTime; }
    this.formattedTime = function () {
        if (!maxTimeString)
            maxTimeString = new Date(maxTime).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        return maxTimeString;
    }
    this.buildTime = function () { return buildTime; }
    this.formattedBuildTime = function () {
        if (!buildTimeString)
            buildTimeString = new Date(buildTime).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        return buildTimeString;
    }
    this.builder = function () { return builders[rawRun.builder].name; }
    this.buildNumber = function () { return rawRun.buildNumber; }
    this.buildUrl = function () {
        var builder = builders[rawRun.builder];
        var template = builder.buildUrl;
        if (!template)
            return null;
        return template.replace(/\$buildNumber/g, this.buildNumber()).replace(/\$builderName/g, builder.name);
    }
    this.platform = function () { return platform; }
    this.revision = function(repositoryId) { return revisions[repositoryId][0]; }
    this.formattedRevisions = function (previousBuild) {
        var result = {};
        for (var repositoryId in repositories) {
            if (!revisions[repositoryId])
                continue;
            var previousRevision = previousBuild ? previousBuild.revision(repositoryId) : undefined;
            var currentRevision = this.revision(repositoryId);
            if (previousRevision === currentRevision)
                previousRevision = undefined;

            var revisionPrefix = '';
            var revisionDelimiter = '-';
            var isHash = false;
            if (parseInt(currentRevision) == currentRevision) { // e.g. r12345.
                revisionPrefix = 'r';
                if (previousRevision)
                    previousRevision = (parseInt(previousRevision) + 1);
            } else if (currentRevision.indexOf(' ') >= 0) // e.g. 10.9 13C64.
                revisionDelimiter = ' - ';
            else if (currentRevision.length == 40) // e.g. git hash
                isHash = true;

            var labelForThisRepository;
            if (isHash) {
                formattedCurrentHash = currentRevision.substring(0, 8);
                if (previousRevision)
                    labelForThisRepository = previousRevision.substring(0, 8) + '..' + formattedCurrentHash;
                else
                    labelForThisRepository = '@ ' + formattedCurrentHash;
            } else {
                if (previousRevision)
                    labelForThisRepository = revisionPrefix + previousRevision + revisionDelimiter + revisionPrefix + currentRevision;
                else
                    labelForThisRepository = '@ ' + revisionPrefix + currentRevision;
            }

            var url;
            var repository = repositories[repositoryId];
            if (repository) {
                if (previousRevision)
                    url = (repository['blameUrl'] || '').replace(/\$1/g, previousRevision).replace(/\$2/g, currentRevision);
                else
                    url = (repository['url'] || '').replace(/\$1/g, currentRevision);
            }

            result[repository.name] = {
                'label': labelForThisRepository,
                'currentRevision': currentRevision,
                'previousRevision': previousRevision,
                'url': url,
            };
        }
        return result;
    }
}

TestBuild.UTCtoPST = function (date) {
    // Pretend that PST is UTC since vanilla flot doesn't support multiple timezones.
    const PSTOffsetInMilliseconds = 8 * 3600 * 1000;
    return date - PSTOffsetInMilliseconds;
}
TestBuild.now = function () { return this.UTCtoPST(Date.now()); }

// A sequence of test results for a specific test on a specific platform
function PerfTestRuns(metric, platform) {
    var results = [];
    var cachedUnit = null;
    var cachedScalingFactor = null;
    var baselines = {};
    var suffix = metric.name.match('([A-z][a-z]+|FrameRate)$')[0];
    var unit = {'Combined': '', // Assume smaller is better for now.
        'FrameRate': 'fps',
        'Runs': '/s',
        'Time': 'ms',
        'Duration': 'ms',
        'Malloc': 'B',
        'Heap': 'B',
        'Allocations': 'B',
        'Size': 'B',
        'Score': 'pt'}[suffix];

    // We can't do this in PerfTestResult because all results for each metric need to share the same unit and the same scaling factor.
    function computeScalingFactorIfNeeded() {
        // FIXME: We shouldn't be adjusting units on every test result.
        // We can only do this on the first test.
        if (!results.length || cachedUnit)
            return;

        var mean = results[0].unscaledMean(); // FIXME: We should look at all values.
        var kilo = unit == 'B' ? 1024 : 1000;
        if (mean > 2 * kilo * kilo && unit != 'ms') {
            cachedScalingFactor = 1 / kilo / kilo;
            var unitFirstChar = unit.charAt(0);
            cachedUnit = 'M' + (unitFirstChar.toUpperCase() == unitFirstChar ? '' : ' ') + unit;
        } else if (mean > 2 * kilo) {
            cachedScalingFactor = 1 / kilo;
            cachedUnit = unit == 'ms' ? 's' : ('K ' + unit);
        } else {
            cachedScalingFactor = 1;
            cachedUnit = unit;
        }
    }

    this.metric = function () { return metric; }
    this.platform = function () { return platform; }
    this.setResults = function (newResults) {
        results = newResults;
        cachedUnit = null;
        cachedScalingFactor = null;
    }
    this.lastResult = function () { return results[results.length - 1]; }
    this.resultAt = function (i) { return results[i]; }

    var resultsFilterCache;
    var resultsFilterCacheMinTime;
    function filteredResults(minTime) {
        if (!minTime)
            return results;
        if (resultsFilterCacheMinTime != minTime) {
            resultsFilterCache = results.filter(function (result) { return !minTime || result.build().time() >= minTime; });
            resultsFilterCacheMinTime = minTime;
        }
        return resultsFilterCache;
    }

    function unscaledMeansForAllResults(minTime) {
        return filteredResults(minTime).map(function (result) { return result.unscaledMean(); });
    }

    this.min = function (minTime) {
        return this.scalingFactor() * filteredResults(minTime)
            .reduce(function (minSoFar, result) { return Math.min(minSoFar, result.unscaledMean() - result.unscaledConfidenceIntervalDelta(0)); }, Number.MAX_VALUE);
    }
    this.max = function (minTime, baselineName) {
        return this.scalingFactor() * filteredResults(minTime)
            .reduce(function (maxSoFar, result) { return Math.max(maxSoFar, result.unscaledMean() + result.unscaledConfidenceIntervalDelta(0)); }, Number.MIN_VALUE);
    }
    this.countResults = function (minTime) {
        return unscaledMeansForAllResults(minTime).length;
    }
    this.countResultsInInterval = function (minTime, min, max) {
        var unscaledMin = min / this.scalingFactor();
        var unscaledMax = max / this.scalingFactor();
        return filteredResults(minTime).reduce(function (count, currentResult) {
            return count + (currentResult.isInUnscaledInterval(unscaledMin, unscaledMax) ? 1 : 0); }, 0);
    }
    this.sampleStandardDeviation = function (minTime) {
        var unscaledMeans = unscaledMeansForAllResults(minTime);
        return this.scalingFactor() * Statistics.sampleStandardDeviation(unscaledMeans.length, Statistics.sum(unscaledMeans), Statistics.squareSum(unscaledMeans));
    }
    this.exponentialMovingArithmeticMean = function (minTime, alpha) {
        var unscaledMeans = unscaledMeansForAllResults(minTime);
        if (!unscaledMeans.length)
            return NaN;
        return this.scalingFactor() * unscaledMeans.reduce(function (movingAverage, currentMean) { return alpha * currentMean + (1 - alpha) * movingAverage; });
    }
    this.hasConfidenceInterval = function () { return !isNaN(this.lastResult().unscaledConfidenceIntervalDelta()); }
    var meanPlotCache;
    this.meanPlotData = function () {
        if (!meanPlotCache)
            meanPlotCache = results.map(function (result, index) { return [result.build().time(), result.mean()]; });
        return meanPlotCache;
    }
    var upperConfidenceCache;
    this.upperConfidencePlotData = function () {
        if (!upperConfidenceCache) // FIXME: Use the actual confidence interval
            upperConfidenceCache = results.map(function (result, index) { return [result.build().time(), result.mean() + result.confidenceIntervalDelta()]; });
        return upperConfidenceCache;
    }
    var lowerConfidenceCache;
    this.lowerConfidencePlotData = function () {
        if (!lowerConfidenceCache) // FIXME: Use the actual confidence interval
            lowerConfidenceCache = results.map(function (result, index) { return [result.build().time(), result.mean() - result.confidenceIntervalDelta()]; });
        return lowerConfidenceCache;
    }
    this.scalingFactor = function() {
        computeScalingFactorIfNeeded();
        return cachedScalingFactor;
    }
    this.unit = function () {
        computeScalingFactorIfNeeded();
        return cachedUnit;
    }
    this.smallerIsBetter = function() { return unit == 'ms' || unit == 'B' || unit == ''; }
}

var URLState = new (function () {
    var hash;
    var parameters;
    var updateTimer;

    function parseIfNeeded() {
        if (updateTimer || '#' + hash == location.hash)
            return;
        hash = location.hash.substr(1).replace(/\/+$/, '');
        parameters = {};
        hash.split(/[&;]/).forEach(function (token) {
            var keyValue = token.split('=');
            var key = decodeURIComponent(keyValue[0]);
            if (key.length)
                parameters[key] = decodeURIComponent(keyValue.slice(1).join('='));
        });
    }

    function updateHash() {
        if (location.hash != hash)
            location.hash = hash;
    }

    this.get = function (key, defaultValue) {
        parseIfNeeded();
        if (key in parameters)
            return parameters[key];
        else
            return defaultValue;
    }

    function scheduleHashUpdate() {
        var newHash = '';
        for (key in parameters) {
            if (newHash.length)
                newHash += '&';
            newHash += encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key]);
        }
        hash = newHash;
        if (updateTimer)
            clearTimeout(updateTimer);

        updateTimer = setTimeout(function () {
            updateTimer = undefined;
            updateHash();
        }, 500);
    }

    this.set = function (key, value) {
        parseIfNeeded();
        parameters[key] = value;
        scheduleHashUpdate();
    }

    this.remove = function (key) {
        parseIfNeeded();
        delete parameters[key];
        scheduleHashUpdate();
    }

    var watchCallbacks = {};
    function onhashchange() {
        if ('#' + hash == location.hash)
            return;

        // Race. If the hash had changed while we're waiting to update, ignore the change.
        if (updateTimer) {
            clearTimeout(updateTimer);
            updateTimer = undefined;
        }

        // FIXME: Consider ignoring URLState.set/remove while notifying callbacks.
        var oldParameters = parameters;
        parseIfNeeded();
        var callbacks = [];
        var changedStates = [];
        for (var key in watchCallbacks) {
            if (parameters[key] == oldParameters[key])
                continue;
            changedStates.push(key);
            callbacks.push(watchCallbacks[key]);
        }

        for (var i = 0; i < callbacks.length; i++)
            callbacks[i](changedStates);
    }
    $(window).bind('hashchange', onhashchange);

    // FIXME: Support multiple callbacks on a single key.
    this.watch = function (key, callback) {
        parseIfNeeded();
        watchCallbacks[key] = callback;
    }
});

function Tooltip(containerParent, className) {
    var container;
    var self = this;
    var hideTimer; // Use setTimeout(~, 0) to workaround the race condition that arises when moving mouse fast.
    var previousContent;

    function ensureContainer() {
        if (container)
            return;
        container = document.createElement('div');
        $(containerParent).append(container);
        container.className = className;
        container.style.position = 'absolute';
        $(container).hide();
    }

    this.show = function (x, y, content) {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = undefined;
        }

        if (previousContent === content) {
            $(container).show();
            return;
        }
        previousContent = content;

        ensureContainer();
        container.innerHTML = content;
        $(container).show();
        // FIXME: Style specific computation like this one shouldn't be in Tooltip class.
        var top = y - $(container).outerHeight() - 15;
        if (top < 0) {
            $(container).addClass('inverted');
            top = y + 15;
        } else
            $(container).removeClass('inverted');
        $(container).offset({left: x - $(container).outerWidth() / 2, top: top});
    }

    this.hide = function () {
        if (!container)
            return;

        if (hideTimer)
            clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
            $(container).fadeOut(100);
            previousResult = undefined;
        }, 0);
    }

    this.remove = function (immediately) {
        if (!container)
            return;

        if (hideTimer)
            clearTimeout(hideTimer);

        $(container).remove();
        container = undefined;
        previousResult = undefined;
    }

    this.toggle = function () {
        $(container).toggle();
        document.body.appendChild(container); // Toggled tooltip should show up at the top.
    }

    this.bindClick = function (callback) {
        ensureContainer();
        $(container).bind('click', callback);
    }
    this.bindMouseEnter = function (callback) {
        ensureContainer();
        $(container).bind('mouseenter', callback);
    }
}
