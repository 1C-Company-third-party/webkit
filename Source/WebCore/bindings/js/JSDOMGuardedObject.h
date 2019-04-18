/*
 * Copyright (C) 2017 Apple Inc. All rights reserved.
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

#pragma once

#include "ActiveDOMCallback.h"
#include "JSDOMGlobalObject.h"
#include <heap/HeapInlines.h>
#include <heap/SlotVisitorInlines.h>
#include <heap/StrongInlines.h>
#include <runtime/JSCell.h>

namespace WebCore {

class WEBCORE_EXPORT DOMGuardedObject : public RefCounted<DOMGuardedObject>, public ActiveDOMCallback {
public:
    ~DOMGuardedObject();

    bool isSuspended() const { return !m_guarded || !canInvokeCallback(); } // The wrapper world has gone away or active DOM objects have been suspended.

    void visitAggregate(JSC::SlotVisitor& visitor) { visitor.append(m_guarded); }

    JSC::JSValue guardedObject() const { return m_guarded.get(); }
    JSDOMGlobalObject* globalObject() const { return m_globalObject.get(); }

protected:
    DOMGuardedObject(JSDOMGlobalObject&, JSC::JSCell&);

    void clear();
    void contextDestroyed() override;
    bool isEmpty() { return !m_guarded; }

    JSC::Weak<JSC::JSCell> m_guarded;
    JSC::Weak<JSDOMGlobalObject> m_globalObject;
};

template <typename T> class DOMGuarded : public DOMGuardedObject {
protected:
    DOMGuarded(JSDOMGlobalObject& globalObject, T& guarded) : DOMGuardedObject(globalObject, guarded) { }
    T* guarded() const { return JSC::jsDynamicCast<T*>(globalObject()->vm(), guardedObject()); }
};

} // namespace WebCore
