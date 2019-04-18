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

#include "ServiceWorkerContextData.h"
#include "ServiceWorkerRegistration.h"
#include "WorkerGlobalScope.h"

namespace WebCore {

class DeferredPromise;
class ServiceWorkerThread;

class ServiceWorkerGlobalScope : public WorkerGlobalScope {
public:
    template<typename... Args> static Ref<ServiceWorkerGlobalScope> create(Args&&... args)
    {
        return adoptRef(*new ServiceWorkerGlobalScope(std::forward<Args>(args)...));
    }

    virtual ~ServiceWorkerGlobalScope();

    bool isServiceWorkerGlobalScope() const final { return true; }

    ServiceWorkerRegistration& registration();
    
    uint64_t serverConnectionIdentifier() const { return m_serverConnectionIdentifier; }

    void skipWaiting(Ref<DeferredPromise>&&);

    EventTargetInterface eventTargetInterface() const final;

private:
    ServiceWorkerGlobalScope(uint64_t serverConnectionIdentifier, const ServiceWorkerContextData&, const URL&, const String& identifier, const String& userAgent, ServiceWorkerThread&, bool shouldBypassMainWorldContentSecurityPolicy, Ref<SecurityOrigin>&& topOrigin, MonotonicTime timeOrigin, IDBClient::IDBConnectionProxy*, SocketProvider*, PAL::SessionID);

    uint64_t m_serverConnectionIdentifier;
    ServiceWorkerContextData m_contextData;
};

} // namespace WebCore

#endif // ENABLE(SERVICE_WORKER)
