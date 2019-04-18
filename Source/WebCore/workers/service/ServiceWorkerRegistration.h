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

#if ENABLE(SERVICE_WORKER)

#include "ActiveDOMObject.h"
#include "EventTarget.h"
#include "JSDOMPromiseDeferred.h"
#include "ServiceWorkerRegistrationData.h"

namespace WebCore {

class ScriptExecutionContext;
class ServiceWorker;

class ServiceWorkerRegistration final : public RefCounted<ServiceWorkerRegistration>, public EventTargetWithInlineData, public ActiveDOMObject {
public:
    enum class UpdateViaCache {
        Imports,
        All,
        None,
    };

    static Ref<ServiceWorkerRegistration> create(ScriptExecutionContext& context, const ServiceWorkerRegistrationData& data)
    {
        return adoptRef(*new ServiceWorkerRegistration(context, data));
    }

    virtual ~ServiceWorkerRegistration() = default;

    ServiceWorker* installing();
    ServiceWorker* waiting();
    ServiceWorker* active();

    const String& scope() const;
    UpdateViaCache updateViaCache() const;

    void update(Ref<DeferredPromise>&&);
    void unregister(Ref<DeferredPromise>&&);

    using RefCounted::ref;
    using RefCounted::deref;

private:
    ServiceWorkerRegistration(ScriptExecutionContext&, const ServiceWorkerRegistrationData&);

    virtual EventTargetInterface eventTargetInterface() const;
    virtual ScriptExecutionContext* scriptExecutionContext() const;
    void refEventTarget() final { ref(); }
    void derefEventTarget() final { deref(); }

    const char* activeDOMObjectName() const { return "ServiceWorkerRegistration"; }
    bool canSuspendForDocumentSuspension() const { return false; }

    ServiceWorkerRegistrationData m_registrationData;
};

} // namespace WebCore

#endif // ENABLE(SERVICE_WORKER)
