/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 * Copyright (C) 2015-2016 Apple Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */


#include "config.h"
#include "JSCustomElementInterface.h"

#include "DOMWrapperWorld.h"
#include "HTMLUnknownElement.h"
#include "JSDOMBinding.h"
#include "JSDOMConvertNullable.h"
#include "JSDOMConvertStrings.h"
#include "JSDOMGlobalObject.h"
#include "JSElement.h"
#include "JSHTMLElement.h"
#include "JSMainThreadExecState.h"
#include "JSMainThreadExecStateInstrumentation.h"
#include "ScriptExecutionContext.h"
#include <heap/WeakInlines.h>
#include <runtime/JSLock.h>


namespace WebCore {
using namespace JSC;

JSCustomElementInterface::JSCustomElementInterface(const QualifiedName& name, JSObject* constructor, JSDOMGlobalObject* globalObject)
    : ActiveDOMCallback(globalObject->scriptExecutionContext())
    , m_name(name)
    , m_constructor(constructor)
    , m_isolatedWorld(globalObject->world())
{
}

JSCustomElementInterface::~JSCustomElementInterface()
{
}

static RefPtr<Element> constructCustomElementSynchronously(Document&, VM&, ExecState&, JSObject* constructor, const AtomicString& localName);

Ref<Element> JSCustomElementInterface::constructElementWithFallback(Document& document, const AtomicString& localName)
{
    if (auto element = tryToConstructCustomElement(document, localName))
        return element.releaseNonNull();

    auto element = HTMLUnknownElement::create(QualifiedName(nullAtom(), localName, HTMLNames::xhtmlNamespaceURI), document);
    element->setIsCustomElementUpgradeCandidate();
    element->setIsFailedCustomElement(*this);

    return WTFMove(element);
}

Ref<Element> JSCustomElementInterface::constructElementWithFallback(Document& document, const QualifiedName& name)
{
    if (auto element = tryToConstructCustomElement(document, name.localName())) {
        if (!name.prefix().isNull())
            element->setPrefix(name.prefix());
        return element.releaseNonNull();
    }

    auto element = HTMLUnknownElement::create(name, document);
    element->setIsCustomElementUpgradeCandidate();
    element->setIsFailedCustomElement(*this);

    return WTFMove(element);
}

RefPtr<Element> JSCustomElementInterface::tryToConstructCustomElement(Document& document, const AtomicString& localName)
{
    if (!canInvokeCallback())
        return nullptr;

    Ref<JSCustomElementInterface> protectedThis(*this);

    VM& vm = m_isolatedWorld->vm();
    JSLockHolder lock(vm);
    auto scope = DECLARE_CATCH_SCOPE(vm);

    if (!m_constructor)
        return nullptr;

    ASSERT(&document == scriptExecutionContext());
    auto& state = *document.execState();
    auto element = constructCustomElementSynchronously(document, vm, state, m_constructor.get(), localName);
    EXCEPTION_ASSERT(!!scope.exception() == !element);
    if (!element) {
        auto* exception = scope.exception();
        scope.clearException();
        reportException(&state, exception);
        return nullptr;
    }

    return element;
}

// https://dom.spec.whatwg.org/#concept-create-element
// 6. 1. If the synchronous custom elements flag is set
static RefPtr<Element> constructCustomElementSynchronously(Document& document, VM& vm, ExecState& state, JSObject* constructor, const AtomicString& localName)
{
    auto scope = DECLARE_THROW_SCOPE(vm);
    ConstructData constructData;
    ConstructType constructType = constructor->methodTable(vm)->getConstructData(constructor, constructData);
    if (constructType == ConstructType::None) {
        ASSERT_NOT_REACHED();
        return nullptr;
    }

    InspectorInstrumentationCookie cookie = JSMainThreadExecState::instrumentFunctionConstruct(&document, constructType, constructData);
    MarkedArgumentBuffer args;
    JSValue newElement = construct(&state, constructor, constructType, constructData, args);
    InspectorInstrumentation::didCallFunction(cookie, &document);
    RETURN_IF_EXCEPTION(scope, nullptr);

    ASSERT(!newElement.isEmpty());
    HTMLElement* wrappedElement = JSHTMLElement::toWrapped(vm, newElement);
    if (!wrappedElement) {
        throwTypeError(&state, scope, ASCIILiteral("The result of constructing a custom element must be a HTMLElement"));
        return nullptr;
    }

    if (wrappedElement->hasAttributes()) {
        throwNotSupportedError(state, scope, ASCIILiteral("A newly constructed custom element must not have attributes"));
        return nullptr;
    }
    if (wrappedElement->hasChildNodes()) {
        throwNotSupportedError(state, scope, ASCIILiteral("A newly constructed custom element must not have child nodes"));
        return nullptr;
    }
    if (wrappedElement->parentNode()) {
        throwNotSupportedError(state, scope, ASCIILiteral("A newly constructed custom element must not have a parent node"));
        return nullptr;
    }
    if (&wrappedElement->document() != &document) {
        throwNotSupportedError(state, scope, ASCIILiteral("A newly constructed custom element belongs to a wrong docuemnt"));
        return nullptr;
    }
    ASSERT(wrappedElement->namespaceURI() == HTMLNames::xhtmlNamespaceURI);
    if (wrappedElement->localName() != localName) {
        throwNotSupportedError(state, scope, ASCIILiteral("A newly constructed custom element belongs to a wrong docuemnt"));
        return nullptr;
    }

    return wrappedElement;
}

void JSCustomElementInterface::upgradeElement(Element& element)
{
    ASSERT(element.tagQName() == name());
    ASSERT(element.isCustomElementUpgradeCandidate());
    if (!canInvokeCallback())
        return;

    Ref<JSCustomElementInterface> protectedThis(*this);
    VM& vm = m_isolatedWorld->vm();
    JSLockHolder lock(vm);
    auto scope = DECLARE_THROW_SCOPE(vm);

    if (!m_constructor)
        return;

    ScriptExecutionContext* context = scriptExecutionContext();
    if (!context)
        return;
    ASSERT(context->isDocument());
    JSDOMGlobalObject* globalObject = toJSDOMGlobalObject(context, m_isolatedWorld);
    ExecState* state = globalObject->globalExec();
    RETURN_IF_EXCEPTION(scope, void());

    ConstructData constructData;
    ConstructType constructType = m_constructor->methodTable(vm)->getConstructData(m_constructor.get(), constructData);
    if (constructType == ConstructType::None) {
        ASSERT_NOT_REACHED();
        return;
    }

    CustomElementReactionQueue::enqueuePostUpgradeReactions(element);

    m_constructionStack.append(&element);

    MarkedArgumentBuffer args;
    InspectorInstrumentationCookie cookie = JSMainThreadExecState::instrumentFunctionConstruct(context, constructType, constructData);
    JSValue returnedElement = construct(state, m_constructor.get(), constructType, constructData, args);
    InspectorInstrumentation::didCallFunction(cookie, context);

    m_constructionStack.removeLast();

    if (UNLIKELY(scope.exception())) {
        element.setIsFailedCustomElement(*this);
        reportException(state, scope.exception());
        return;
    }

    Element* wrappedElement = JSElement::toWrapped(vm, returnedElement);
    if (!wrappedElement || wrappedElement != &element) {
        element.setIsFailedCustomElement(*this);
        reportException(state, createDOMException(state, InvalidStateError, "Custom element constructor failed to upgrade an element"));
        return;
    }
    element.setIsDefinedCustomElement(*this);
}

void JSCustomElementInterface::invokeCallback(Element& element, JSObject* callback, const WTF::Function<void(ExecState*, JSDOMGlobalObject*, MarkedArgumentBuffer&)>& addArguments)
{
    if (!canInvokeCallback())
        return;

    auto* context = scriptExecutionContext();
    if (!context)
        return;

    Ref<JSCustomElementInterface> protectedThis(*this);
    VM& vm = m_isolatedWorld->vm();
    JSLockHolder lock(vm);

    ASSERT(context);
    ASSERT(context->isDocument());
    JSDOMGlobalObject* globalObject = toJSDOMGlobalObject(context, m_isolatedWorld);
    ExecState* state = globalObject->globalExec();

    JSObject* jsElement = asObject(toJS(state, globalObject, element));

    CallData callData;
    CallType callType = callback->methodTable(vm)->getCallData(callback, callData);
    ASSERT(callType != CallType::None);

    MarkedArgumentBuffer args;
    addArguments(state, globalObject, args);

    InspectorInstrumentationCookie cookie = JSMainThreadExecState::instrumentFunctionCall(context, callType, callData);

    NakedPtr<JSC::Exception> exception;
    JSMainThreadExecState::call(state, callback, callType, callData, jsElement, args, exception);

    InspectorInstrumentation::didCallFunction(cookie, context);

    if (exception)
        reportException(state, exception);
}

void JSCustomElementInterface::setConnectedCallback(JSC::JSObject* callback)
{
    m_connectedCallback = callback;
}

void JSCustomElementInterface::invokeConnectedCallback(Element& element)
{
    invokeCallback(element, m_connectedCallback.get());
}

void JSCustomElementInterface::setDisconnectedCallback(JSC::JSObject* callback)
{
    m_disconnectedCallback = callback;
}

void JSCustomElementInterface::invokeDisconnectedCallback(Element& element)
{
    invokeCallback(element, m_disconnectedCallback.get());
}

void JSCustomElementInterface::setAdoptedCallback(JSC::JSObject* callback)
{
    m_adoptedCallback = callback;
}

void JSCustomElementInterface::invokeAdoptedCallback(Element& element, Document& oldDocument, Document& newDocument)
{
    invokeCallback(element, m_adoptedCallback.get(), [&](ExecState* state, JSDOMGlobalObject* globalObject, MarkedArgumentBuffer& args) {
        args.append(toJS(state, globalObject, oldDocument));
        args.append(toJS(state, globalObject, newDocument));
    });
}

void JSCustomElementInterface::setAttributeChangedCallback(JSC::JSObject* callback, const Vector<String>& observedAttributes)
{
    m_attributeChangedCallback = callback;
    m_observedAttributes.clear();
    for (auto& name : observedAttributes)
        m_observedAttributes.add(name);
}

void JSCustomElementInterface::invokeAttributeChangedCallback(Element& element, const QualifiedName& attributeName, const AtomicString& oldValue, const AtomicString& newValue)
{
    invokeCallback(element, m_attributeChangedCallback.get(), [&](ExecState* state, JSDOMGlobalObject*, MarkedArgumentBuffer& args) {
        args.append(toJS<IDLDOMString>(*state, attributeName.localName()));
        args.append(toJS<IDLNullable<IDLDOMString>>(*state, oldValue));
        args.append(toJS<IDLNullable<IDLDOMString>>(*state, newValue));
        args.append(toJS<IDLNullable<IDLDOMString>>(*state, attributeName.namespaceURI()));
    });
}

void JSCustomElementInterface::didUpgradeLastElementInConstructionStack()
{
    m_constructionStack.last() = nullptr;
}

} // namespace WebCore
