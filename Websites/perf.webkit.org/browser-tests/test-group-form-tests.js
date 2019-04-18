
describe('TestGroupFormTests', () => {
    const scripts = ['instrumentation.js', 'components/base.js', 'components/test-group-form.js'];

    function createTestGroupFormWithContext(context)
    {
        return context.importScripts(scripts, 'ComponentBase', 'TestGroupForm').then((symbols) => {
            const testGroupForm = new context.symbols.TestGroupForm;
            context.document.body.appendChild(testGroupForm.element());
            return testGroupForm;
        });
    }

    it('must dispatch "startTesting" action with the number of repetitions the user clicks on "Start A/B testing"', () => {
        const context = new BrowsingContext();
        return createTestGroupFormWithContext(context).then((testGroupForm) => {
            const calls = [];
            testGroupForm.listenToAction('startTesting', (...args) => calls.push(args));
            expect(calls).to.eql({});
            testGroupForm.content('start-button').click();
            expect(calls).to.eql([[4]]);
        });
    });

    it('must update the repetition count when the user selected a different count', () => {
        const context = new BrowsingContext();
        return createTestGroupFormWithContext(context).then((testGroupForm) => {
            const calls = [];
            testGroupForm.listenToAction('startTesting', (...args) => calls.push(args));
            expect(calls).to.eql({});
            testGroupForm.content('start-button').click();
            expect(calls).to.eql([[4]]);
            const countForm = testGroupForm.content('repetition-count');
            countForm.value = '6';
            countForm.dispatchEvent(new Event('change')); 
            testGroupForm.content('start-button').click();
            expect(calls).to.eql([[4], [6]]);
        });
    });

    describe('setRepetitionCount', () => {
        it('must update the visible repetition count', () => {
            const context = new BrowsingContext();
            return createTestGroupFormWithContext(context).then((testGroupForm) => {
                expect(testGroupForm.content('repetition-count').value).to.be('4');
                testGroupForm.setRepetitionCount(2);
                return waitForComponentsToRender(context).then(() => {
                    expect(testGroupForm.content('repetition-count').value).to.be('2');
                });
            });
        });

        it('must update the repetition count passed to "startTesting" action', () => {
            const context = new BrowsingContext();
            return createTestGroupFormWithContext(context).then((testGroupForm) => {
                const calls = [];
                testGroupForm.listenToAction('startTesting', (...args) => calls.push(args));
                expect(calls).to.eql({});
                testGroupForm.content().querySelector('button').click();
                expect(calls).to.eql([[4]]);
                testGroupForm.setRepetitionCount(8);
                testGroupForm.content().querySelector('button').click();
                expect(calls).to.eql([[4], [8]]);
            });
        });
    });
});
