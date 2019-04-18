/*
 * Copyright (C) 2006-2007, 2015 Apple Inc.  All rights reserved.
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
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. 
 */

#include "WebKitDLL.h"
#include "DOMCSSClasses.h"

#include <WebCore/BString.h>
#include <wtf/text/WTFString.h>

// DOMCSSStyleDeclaration - DOMCSSStyleDeclaration ----------------------------

DOMCSSStyleDeclaration::DOMCSSStyleDeclaration(WebCore::CSSStyleDeclaration* s)
{
    if (s)
        s->ref();

    m_style = s;
}

DOMCSSStyleDeclaration::~DOMCSSStyleDeclaration()
{
    if (m_style)
        m_style->deref();
}

IDOMCSSStyleDeclaration* DOMCSSStyleDeclaration::createInstance(WebCore::CSSStyleDeclaration* s)
{
    if (!s)
        return nullptr;

    HRESULT hr;
    IDOMCSSStyleDeclaration* domStyle = 0;

    DOMCSSStyleDeclaration* newStyle = new DOMCSSStyleDeclaration(s);
    hr = newStyle->QueryInterface(IID_IDOMCSSStyleDeclaration, (void**)&domStyle);

    if (FAILED(hr))
        return nullptr;

    return domStyle;
}

// DOMCSSStyleDeclaration - IUnknown ------------------------------------------

HRESULT DOMCSSStyleDeclaration::QueryInterface(_In_ REFIID riid, _COM_Outptr_ void** ppvObject)
{
    if (!ppvObject)
        return E_POINTER;
    *ppvObject = nullptr;
    if (IsEqualGUID(riid, IID_IDOMCSSStyleDeclaration))
        *ppvObject = static_cast<IDOMCSSStyleDeclaration*>(this);
    else
        return DOMObject::QueryInterface(riid, ppvObject);

    AddRef();
    return S_OK;
}

// DOMCSSStyleDeclaration - IDOMCSSStyleDeclaration ---------------------------

HRESULT DOMCSSStyleDeclaration::cssText(__deref_opt_out BSTR* result)
{
    if (!result)
        return E_POINTER;
    *result = nullptr;

    *result = WebCore::BString(m_style->cssText());

    return S_OK;
}

HRESULT DOMCSSStyleDeclaration::setCssText(_In_ BSTR cssText)
{
    WTF::String cssTextString(cssText);
    m_style->setCssText(cssTextString);
    return S_OK;
}

HRESULT DOMCSSStyleDeclaration::getPropertyValue(_In_ BSTR propertyName, __deref_opt_out BSTR* result)
{
    if (!result)
        return E_POINTER;
    *result = nullptr;

    WTF::String propertyNameString(propertyName);
    WTF::String value = m_style->getPropertyValue(propertyNameString);
    *result = WebCore::BString(value).release();
    if (value.length() && !*result)
        return E_OUTOFMEMORY;
    return S_OK;
}

HRESULT DOMCSSStyleDeclaration::getPropertyCSSValue(_In_ BSTR /*propertyName*/, _COM_Outptr_opt_ IDOMCSSValue** result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = nullptr;
    return E_NOTIMPL;
}

HRESULT DOMCSSStyleDeclaration::removeProperty(_In_ BSTR /*propertyName*/, __deref_opt_out BSTR* result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = nullptr;
    return E_NOTIMPL;
}

HRESULT DOMCSSStyleDeclaration::getPropertyPriority(_In_ BSTR /*propertyName*/, __deref_opt_out BSTR* result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = nullptr;
    return E_NOTIMPL;
}

HRESULT DOMCSSStyleDeclaration::setProperty(_In_ BSTR propertyName, _In_ BSTR value, _In_ BSTR priority)
{
    WTF::String propertyNameString(propertyName);
    WTF::String valueString(value);
    WTF::String priorityString(priority);
    m_style->setProperty(propertyNameString, valueString, priorityString);
    return S_OK;
}

HRESULT DOMCSSStyleDeclaration::length(_Out_ UINT* result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = 0;
    return E_NOTIMPL;
}

HRESULT DOMCSSStyleDeclaration::item(UINT /*index*/, __deref_opt_out BSTR* result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = nullptr;
    return E_NOTIMPL;
}

HRESULT DOMCSSStyleDeclaration::parentRule(_COM_Outptr_opt_ IDOMCSSRule** result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = nullptr;
    return E_NOTIMPL;
}


// DOMCSSRule - DOMCSSRule ----------------------------

DOMCSSRule::DOMCSSRule(WebCore::CSSRule* r)
{
    if (r)
        r->ref();

    m_rule = r;
}

DOMCSSRule::~DOMCSSRule()
{
    if (m_rule)
        m_rule->deref();
}

IDOMCSSRule* DOMCSSRule::createInstance(WebCore::CSSRule* r)
{
    if (!r)
        return nullptr;

    HRESULT hr;
    IDOMCSSRule* domRule = 0;

    DOMCSSRule* newRule = new DOMCSSRule(r);
    hr = newRule->QueryInterface(IID_IDOMCSSRule, (void**)&domRule);

    if (FAILED(hr))
        return nullptr;

    return domRule;
}

// DOMCSSRule - IUnknown ------------------------------------------

HRESULT DOMCSSRule::QueryInterface(_In_ REFIID riid, _COM_Outptr_ void** ppvObject)
{
    if (!ppvObject)
        return E_POINTER;
    *ppvObject = nullptr;
    if (IsEqualGUID(riid, IID_IDOMCSSRule))
        *ppvObject = static_cast<IDOMCSSRule*>(this);
    else
        return DOMObject::QueryInterface(riid, ppvObject);

    AddRef();
    return S_OK;
}

// DOMCSSRule - IDOMCSSRule ---------------------------

// IDOMCSSRule
HRESULT DOMCSSRule::type(_Out_ unsigned short *result)
{
    ASSERT_NOT_REACHED();
    if (!result)
        return E_POINTER;
    *result = 0;
    return E_NOTIMPL;
}

HRESULT DOMCSSRule::cssText(_Out_ BSTR *text)
{
    if (!text)
        return E_POINTER;
    *text = nullptr;
    if (!m_rule)
        return E_FAIL;

    *text = WebCore::BString(m_rule->cssText()).release();
    return S_OK;
}

HRESULT DOMCSSRule::setCssText(_In_ BSTR cssText)
{
    ASSERT_NOT_REACHED();
    return E_NOTIMPL;
}

HRESULT DOMCSSRule::parentStyleSheet(_COM_Outptr_opt_ IDOMCSSStyleSheet** sheet)
{
    ASSERT_NOT_REACHED();
    if (!sheet)
        return E_POINTER;
    *sheet = nullptr;
    return E_NOTIMPL;
}

HRESULT DOMCSSRule::parentRule(_COM_Outptr_opt_ IDOMCSSRule** rule)
{
    ASSERT_NOT_REACHED();
    if (!rule)
        return E_POINTER;
    *rule = nullptr;
    return E_NOTIMPL;
}


// DOMCSSRuleList - DOMCSSRuleList ----------------------------

DOMCSSRuleList::DOMCSSRuleList(WebCore::CSSRuleList* s)
{
    if (s)
        s->ref();

    m_ruleList = s;
}

DOMCSSRuleList::~DOMCSSRuleList()
{
    if (m_ruleList)
        m_ruleList->deref();
}

IDOMCSSRuleList* DOMCSSRuleList::createInstance(WebCore::CSSRuleList* s)
{
    if (!s)
        return nullptr;

    HRESULT hr;
    IDOMCSSRuleList* domRuleList = 0;

    DOMCSSRuleList* newRuleList = new DOMCSSRuleList(s);
    hr = newRuleList->QueryInterface(IID_IDOMCSSRuleList, (void**)&domRuleList);

    if (FAILED(hr))
        return nullptr;

    return domRuleList;
}

// DOMCSSRuleList - IUnknown ------------------------------------------

HRESULT DOMCSSRuleList::QueryInterface(_In_ REFIID riid, _COM_Outptr_ void** ppvObject)
{
    if (!ppvObject)
        return E_POINTER;
    *ppvObject = nullptr;
    if (IsEqualGUID(riid, IID_IDOMCSSRuleList))
        *ppvObject = static_cast<IDOMCSSRuleList*>(this);
    else
        return DOMObject::QueryInterface(riid, ppvObject);

    AddRef();
    return S_OK;
}

// DOMCSSRuleList - IDOMCSSRuleList ---------------------------

HRESULT DOMCSSRuleList::length(_Out_ UINT *result)
{
    if (!result)
        return E_POINTER;

    *result = m_ruleList ? m_ruleList->length() : 0;

    return S_OK;
}

HRESULT DOMCSSRuleList::item(UINT index, __deref_opt_out IDOMCSSRule **result)
{
    if (!result)
        return E_POINTER;
    *result = nullptr;
    if (!m_ruleList)
        return E_FAIL;

    *result = DOMCSSRule::createInstance(m_ruleList->item(index));
    return *result ? S_OK : E_FAIL;
}