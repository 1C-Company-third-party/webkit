/*
 * Copyright (C) 2016 Canon Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted, provided that the following conditions
 * are required to be met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Canon Inc. nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY CANON INC. AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL CANON INC. AND ITS CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#pragma once

#include "FetchBodyOwner.h"
#include "FetchHeaders.h"
#include "ResourceResponse.h"
#include <runtime/TypedArrays.h>

namespace JSC {
class ExecState;
class JSValue;
};

namespace WebCore {

class FetchRequest;
class ReadableStreamSource;

class FetchResponse final : public FetchBodyOwner {
public:
    using Type = ResourceResponse::Type;

    struct Init {
        unsigned short status { 200 };
        String statusText { ASCIILiteral("OK") };
        std::optional<FetchHeaders::Init> headers;
    };

    static Ref<FetchResponse> create(ScriptExecutionContext&, std::optional<FetchBody>&&, Ref<FetchHeaders>&&, ResourceResponse&&);

    static ExceptionOr<Ref<FetchResponse>> create(ScriptExecutionContext&, std::optional<FetchBody::Init>&&, Init&&);
    static Ref<FetchResponse> error(ScriptExecutionContext&);
    static ExceptionOr<Ref<FetchResponse>> redirect(ScriptExecutionContext&, const String& url, int status);

    using NotificationCallback = WTF::Function<void(ExceptionOr<FetchResponse&>&&)>;
    static void fetch(ScriptExecutionContext&, FetchRequest&, NotificationCallback&&);

#if ENABLE(STREAMS_API)
    void startConsumingStream(unsigned);
    void consumeChunk(Ref<JSC::Uint8Array>&&);
    void finishConsumingStream(Ref<DeferredPromise>&&);
#endif

    Type type() const { return m_response.type(); }
    const String& url() const;
    bool redirected() const { return m_response.isRedirected(); }
    int status() const { return m_response.httpStatusCode(); }
    bool ok() const { return m_response.isSuccessful(); }
    const String& statusText() const { return m_response.httpStatusText(); }

    const FetchHeaders& headers() const { return m_headers; }
    FetchHeaders& headers() { return m_headers; }
    ExceptionOr<Ref<FetchResponse>> clone(ScriptExecutionContext&);

#if ENABLE(STREAMS_API)
    void consumeBodyAsStream() final;
    void feedStream() final;
    void cancel() final;
#endif

    using ResponseData = Variant<std::nullptr_t, Ref<FormData>, Ref<SharedBuffer>>;
    ResponseData consumeBody();
    void setBodyData(ResponseData&&, uint64_t bodySizeWithPadding);

    bool isLoading() const { return !!m_bodyLoader; }

    using ConsumeDataCallback = WTF::Function<void(ExceptionOr<RefPtr<SharedBuffer>>&&)>;
    void consumeBodyWhenLoaded(ConsumeDataCallback&&);
    void consumeBodyFromReadableStream(ConsumeDataCallback&&);

    const ResourceResponse& resourceResponse() const { return m_response; }

    uint64_t bodySizeWithPadding() const { return m_bodySizeWithPadding; }
    void setBodySizeWithPadding(uint64_t size) { m_bodySizeWithPadding = size; }
    uint64_t opaqueLoadIdentifier() const { return m_opaqueLoadIdentifier; }

private:
    FetchResponse(ScriptExecutionContext&, std::optional<FetchBody>&&, Ref<FetchHeaders>&&, ResourceResponse&&);

    void stop() final;
    const char* activeDOMObjectName() const final;
    bool canSuspendForDocumentSuspension() const final;

#if ENABLE(STREAMS_API)
    void closeStream();
#endif

    class BodyLoader final : public FetchLoaderClient {
    public:
        BodyLoader(FetchResponse&, NotificationCallback&&);
        ~BodyLoader();

        bool start(ScriptExecutionContext&, const FetchRequest&);
        void stop();

        void setConsumeDataCallback(ConsumeDataCallback&& consumeDataCallback) { m_consumeDataCallback = WTFMove(consumeDataCallback); }

#if ENABLE(STREAMS_API)
        RefPtr<SharedBuffer> startStreaming();
#endif

    private:
        // FetchLoaderClient API
        void didSucceed() final;
        void didFail(const ResourceError&) final;
        void didReceiveResponse(const ResourceResponse&) final;
        void didReceiveData(const char*, size_t) final;

        FetchResponse& m_response;
        NotificationCallback m_responseCallback;
        ConsumeDataCallback m_consumeDataCallback;
        std::unique_ptr<FetchLoader> m_loader;
    };

    ResourceResponse m_response;
    std::optional<BodyLoader> m_bodyLoader;
    mutable String m_responseURL;
    // Opaque responses will padd their body size when used with Cache API.
    uint64_t m_bodySizeWithPadding { 0 };
    uint64_t m_opaqueLoadIdentifier { 0 };
};

inline Ref<FetchResponse> FetchResponse::create(ScriptExecutionContext& context, std::optional<FetchBody>&& body, Ref<FetchHeaders>&& headers, ResourceResponse&& response)
{
    return adoptRef(*new FetchResponse(context, WTFMove(body), WTFMove(headers), WTFMove(response)));
}

} // namespace WebCore
