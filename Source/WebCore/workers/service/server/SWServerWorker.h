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

#include "ServiceWorkerRegistrationKey.h"
#include "URL.h"
#include <wtf/ThreadSafeRefCounted.h>

namespace WebCore {

enum class WorkerType;

class SWServerWorker : public ThreadSafeRefCounted<SWServerWorker> {
public:
    static Ref<SWServerWorker> create(const ServiceWorkerRegistrationKey& registrationKey, const URL& url, const String& script, WorkerType type, const String& workerID)
    {
        return adoptRef(*new SWServerWorker(registrationKey, url, script, type, workerID));
    }
    
    SWServerWorker(const SWServerWorker&) = delete;
    ~SWServerWorker();

    const URL& scriptURL() const { return m_scriptURL; }
    const String& script() const { return m_script; }
    WorkerType type() const { return m_type; }
    const String& workerID() const { return m_workerID; }
    
private:
    SWServerWorker(const ServiceWorkerRegistrationKey&, const URL&, const String& script, WorkerType, const String& workerID);

    ServiceWorkerRegistrationKey m_registrationKey;
    URL m_scriptURL;
    String m_script;
    String m_workerID;
    WorkerType m_type;
};

} // namespace WebCore

#endif // ENABLE(SERVICE_WORKER)
