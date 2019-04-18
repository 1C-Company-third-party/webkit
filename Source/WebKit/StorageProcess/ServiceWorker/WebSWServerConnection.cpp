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
#include "WebSWServerConnection.h"

#if ENABLE(SERVICE_WORKER)

#include "DataReference.h"
#include "Logging.h"
#include "StorageToWebProcessConnectionMessages.h"
#include "WebProcess.h"
#include "WebProcessMessages.h"
#include "WebSWClientConnectionMessages.h"
#include "WebSWServerConnectionMessages.h"
#include "WebToStorageProcessConnection.h"
#include <WebCore/ExceptionData.h>
#include <WebCore/NotImplemented.h>
#include <WebCore/ServiceWorkerContextData.h>
#include <WebCore/ServiceWorkerJobData.h>
#include <WebCore/ServiceWorkerRegistrationData.h>
#include <wtf/MainThread.h>

using namespace PAL;
using namespace WebCore;

namespace WebKit {

WebSWServerConnection::WebSWServerConnection(SWServer& server, IPC::Connection& connection, uint64_t connectionIdentifier, const SessionID& sessionID)
    : SWServer::Connection(server, connectionIdentifier)
    , m_sessionID(sessionID)
    , m_contentConnection(connection)
{
}

WebSWServerConnection::~WebSWServerConnection()
{
}

void WebSWServerConnection::disconnectedFromWebProcess()
{
    notImplemented();
}

void WebSWServerConnection::rejectJobInClient(uint64_t jobIdentifier, const ExceptionData& exceptionData)
{
    send(Messages::WebSWClientConnection::JobRejectedInServer(jobIdentifier, exceptionData));
}

void WebSWServerConnection::resolveJobInClient(uint64_t jobIdentifier, const ServiceWorkerRegistrationData& registrationData)
{
    send(Messages::WebSWClientConnection::JobResolvedInServer(jobIdentifier, registrationData));
}

void WebSWServerConnection::startScriptFetchInClient(uint64_t jobIdentifier)
{
    send(Messages::WebSWClientConnection::StartScriptFetchForServer(jobIdentifier));
}

void WebSWServerConnection::startServiceWorkerContext(const ServiceWorkerContextData& data)
{
    if (sendToContextProcess(Messages::WebProcess::StartServiceWorkerContext(identifier(), data)))
        return;

    m_pendingContextDatas.append(data);
}

template<typename U> bool WebSWServerConnection::sendToContextProcess(U&& message)
{
    if (!m_contextConnection)
        return false;

    return m_contextConnection->send<U>(WTFMove(message), 0);
}

void WebSWServerConnection::setContextConnection(IPC::Connection* connection)
{
    m_contextConnection = connection;

    // We can now start any pending service worker contexts.
    for (auto& pendingContextData : m_pendingContextDatas)
        startServiceWorkerContext(pendingContextData);
    
    m_pendingContextDatas.clear();
}
    
} // namespace WebKit

#endif // ENABLE(SERVICE_WORKER)
