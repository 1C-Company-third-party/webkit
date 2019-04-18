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

#include "config.h"
#include "ServiceWorkerJob.h"

#if ENABLE(SERVICE_WORKER)

#include "JSDOMPromiseDeferred.h"
#include "ResourceError.h"
#include "ResourceResponse.h"
#include "ServiceWorkerJobData.h"
#include "ServiceWorkerRegistration.h"

namespace WebCore {

ServiceWorkerJob::ServiceWorkerJob(ServiceWorkerJobClient& client, Ref<DeferredPromise>&& promise, ServiceWorkerJobData&& jobData)
    : m_client(client)
    , m_jobData(WTFMove(jobData))
    , m_promise(WTFMove(promise))
{
}

ServiceWorkerJob::~ServiceWorkerJob()
{
    ASSERT(currentThread() == m_creationThread);
}

void ServiceWorkerJob::failedWithException(const Exception& exception)
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(!m_completed);

    m_completed = true;
    m_client->jobFailedWithException(*this, exception);
}

void ServiceWorkerJob::resolvedWithRegistration(const ServiceWorkerRegistrationData& data)
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(!m_completed);

    m_completed = true;
    m_client->jobResolvedWithRegistration(*this, data);
}

void ServiceWorkerJob::startScriptFetch()
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(!m_completed);

    m_client->startScriptFetchForJob(*this);
}

void ServiceWorkerJob::fetchScriptWithContext(ScriptExecutionContext& context)
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(!m_completed);

    // FIXME: WorkerScriptLoader is the wrong loader class to use here, but there's nothing else better right now.
    m_scriptLoader = WorkerScriptLoader::create();
    m_scriptLoader->loadAsynchronously(&context, m_jobData.scriptURL, FetchOptions::Mode::SameOrigin, ContentSecurityPolicyEnforcement::DoNotEnforce, "serviceWorkerScriptLoad:", this);
}

void ServiceWorkerJob::didReceiveResponse(unsigned long, const ResourceResponse& response)
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(!m_completed);
    ASSERT(m_scriptLoader);

    m_lastResponse = response;
}

void ServiceWorkerJob::notifyFinished()
{
    ASSERT(currentThread() == m_creationThread);
    ASSERT(m_scriptLoader);
    
    if (!m_scriptLoader->failed())
        m_client->jobFinishedLoadingScript(*this, m_scriptLoader->script());
    else
        m_client->jobFailedLoadingScript(*this, m_scriptLoader->error());

    m_scriptLoader = nullptr;
}

} // namespace WebCore

#endif // ENABLE(SERVICE_WORKER)
