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

#include "MessageReceiver.h"
#include "MessageSender.h"
#include <WebCore/SWServer.h>
#include <pal/SessionID.h>

namespace WebCore {
struct ExceptionData;
struct ServiceWorkerRegistrationKey;
}

namespace WebKit {

class WebSWServerConnection : public WebCore::SWServer::Connection, public IPC::MessageSender, public IPC::MessageReceiver {
public:
    WebSWServerConnection(WebCore::SWServer&, IPC::Connection&, uint64_t connectionIdentifier, const PAL::SessionID&);
    WebSWServerConnection(const WebSWServerConnection&) = delete;
    ~WebSWServerConnection() final;

    void disconnectedFromWebProcess();
    void setContextConnection(IPC::Connection*);
    void didReceiveMessage(IPC::Connection&, IPC::Decoder&) final;

private:
    // Implement SWServer::Connection (Messages to the client WebProcess)
    void rejectJobInClient(uint64_t jobIdentifier, const WebCore::ExceptionData&) final;
    void resolveJobInClient(uint64_t jobIdentifier, const WebCore::ServiceWorkerRegistrationData&) final;
    void startScriptFetchInClient(uint64_t jobIdentifier) final;

    // Messages to the SW context WebProcess
    void startServiceWorkerContext(const WebCore::ServiceWorkerContextData&) final;
    
    IPC::Connection* messageSenderConnection() final { return m_contentConnection.ptr(); }
    uint64_t messageSenderDestinationID() final { return identifier(); }

    template<typename U> bool sendToContextProcess(U&& message);
    
    PAL::SessionID m_sessionID;

    Ref<IPC::Connection> m_contentConnection;
    RefPtr<IPC::Connection> m_contextConnection;
    
    Deque<WebCore::ServiceWorkerContextData> m_pendingContextDatas;
}; // class WebSWServerConnection

} // namespace WebKit

#endif // ENABLE(SERVICE_WORKER)
