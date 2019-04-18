/*
 * Copyright (C) 2013 Apple Inc. All rights reserved.
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

#include "config.h"
#include "WebInjectedScriptHost.h"

#include "DOMException.h"
#include "JSDOMException.h"
#include "JSHTMLAllCollection.h"
#include "JSHTMLCollection.h"
#include "JSNode.h"
#include "JSNodeList.h"


namespace WebCore {
using namespace JSC;

JSValue WebInjectedScriptHost::subtype(JSC::ExecState* exec, JSC::JSValue value)
{
    VM& vm = exec->vm();
    if (value.inherits(vm, JSNode::info()))
        return jsNontrivialString(exec, ASCIILiteral("node"));
    if (value.inherits(vm, JSNodeList::info()))
        return jsNontrivialString(exec, ASCIILiteral("array"));
    if (value.inherits(vm, JSHTMLCollection::info()))
        return jsNontrivialString(exec, ASCIILiteral("array"));
    if (value.inherits(vm, JSDOMException::info()))
        return jsNontrivialString(exec, ASCIILiteral("error"));

    return jsUndefined();
}

bool WebInjectedScriptHost::isHTMLAllCollection(JSC::VM& vm, JSC::JSValue value)
{
    return value.inherits(vm, JSHTMLAllCollection::info());
}

} // namespace WebCore
