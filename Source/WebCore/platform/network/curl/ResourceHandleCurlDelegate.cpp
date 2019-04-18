/*
 * Copyright (C) 2004, 2006 Apple Inc.  All rights reserved.
 * Copyright (C) 2005, 2006 Michael Emmel mike.emmel@gmail.com
 * Copyright (C) 2017 Sony Interactive Entertainment Inc.
 * All rights reserved.
 * Copyright (C) 2017 NAVER Corp. All rights reserved.
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
#include "ResourceHandleCurlDelegate.h"

#if USE(CURL)

#include "AuthenticationChallenge.h"
#include "CredentialStorage.h"
#include "CurlCacheManager.h"
#include "CurlRequest.h"
#include "HTTPParsers.h"
#include "MultipartHandle.h"
#include "ResourceHandleInternal.h"
#include "SharedBuffer.h"
#include "TextEncoding.h"
#include <wtf/text/Base64.h>

namespace WebCore {

ResourceHandleCurlDelegate::ResourceHandleCurlDelegate(ResourceHandle* handle)
    : m_handle(handle)
    , m_firstRequest(handle->firstRequest().isolatedCopy())
    , m_currentRequest(handle->firstRequest().isolatedCopy())
    , m_shouldUseCredentialStorage(handle->shouldUseCredentialStorage())
    , m_user(handle->getInternal()->m_user.isolatedCopy())
    , m_pass(handle->getInternal()->m_pass.isolatedCopy())
    , m_initialCredential(handle->getInternal()->m_initialCredential)
    , m_defersLoading(handle->getInternal()->m_defersLoading)
{
    if (m_handle)
        m_handle->ref();
}

ResourceHandleCurlDelegate::~ResourceHandleCurlDelegate()
{
    if (m_handle)
        m_handle->deref();

    if (m_curlRequest)
        m_curlRequest->setDelegate(nullptr);
}

bool ResourceHandleCurlDelegate::hasHandle() const
{
    return !!m_handle;
}

void ResourceHandleCurlDelegate::releaseHandle()
{
    m_handle = nullptr;
}

bool ResourceHandleCurlDelegate::start()
{
    ASSERT(isMainThread());

    m_curlRequest = createCurlRequest(m_currentRequest);

    if (auto credential = getCredential(m_currentRequest, false))
    {
        m_curlRequest->setUserPass(credential->user(), credential->password());
        m_curlRequest->setAuthenticationScheme(ProtectionSpaceAuthenticationSchemeHTTPBasic);
    }

    m_curlRequest->start();

    return true;
}

void ResourceHandleCurlDelegate::cancel()
{
    ASSERT(isMainThread());

    releaseHandle();

    if (m_curlRequest)
        m_curlRequest->cancel();
}

void ResourceHandleCurlDelegate::setDefersLoading(bool defers)
{
    ASSERT(isMainThread());

    if (defers == m_defersLoading)
        return;

    m_defersLoading = defers;

    if (!m_curlRequest)
        return;

    if (m_defersLoading)
        m_curlRequest->suspend();
    else
        m_curlRequest->resume();
}

void ResourceHandleCurlDelegate::setAuthentication(const ProtectionSpace& protectionSpace, const Credential& credential)
{
    ASSERT(isMainThread());

    if (!m_curlRequest)
        return;

    bool isSyncRequest = m_curlRequest->isSyncRequest();
    m_curlRequest->cancel();
    m_curlRequest->setDelegate(nullptr);

    m_curlRequest = createCurlRequest(m_currentRequest);
    m_curlRequest->setAuthenticationScheme(protectionSpace.authenticationScheme());
    m_curlRequest->setUserPass(credential.user(), credential.password());
    m_curlRequest->start(isSyncRequest);
}

void ResourceHandleCurlDelegate::dispatchSynchronousJob()
{
    if (m_currentRequest.url().protocolIsData()) {
        handleDataURL();
        return;
    }

    // If defersLoading is true and we call curl_easy_perform
    // on a paused handle, libcURL would do the transfert anyway
    // and we would assert so force defersLoading to be false.
    m_defersLoading = false;

    m_curlRequest = createCurlRequest(m_currentRequest);

    if (auto credential = getCredential(m_firstRequest, false)) {
        m_curlRequest->setUserPass(credential->user(), credential->password());
        m_curlRequest->setAuthenticationScheme(ProtectionSpaceAuthenticationSchemeHTTPBasic);
    }

    m_curlRequest->start(true);
}

Ref<CurlRequest> ResourceHandleCurlDelegate::createCurlRequest(ResourceRequest& request)
{
    ASSERT(isMainThread());

    // CurlCache : append additional cache information
    m_addedCacheValidationHeaders = false;

    bool hasCacheHeaders = request.httpHeaderFields().contains(HTTPHeaderName::IfModifiedSince) || request.httpHeaderFields().contains(HTTPHeaderName::IfNoneMatch);
    if (!hasCacheHeaders) {
        auto& cache = CurlCacheManager::getInstance();
        URL cacheUrl = request.url();
        cacheUrl.removeFragmentIdentifier();

        if (cache.isCached(cacheUrl)) {
            cache.addCacheEntryClient(cacheUrl, m_handle);

            for (auto entry : cache.requestHeaders(cacheUrl))
                request.addHTTPHeaderField(entry.key, entry.value);

            m_addedCacheValidationHeaders = true;
        }
    }

    return CurlRequest::create(request, this, m_defersLoading);
}

bool ResourceHandleCurlDelegate::cancelledOrClientless()
{
    if (!m_handle)
        return true;

    return !m_handle->client();
}

void ResourceHandleCurlDelegate::curlDidReceiveResponse(const CurlResponse& receivedResponse)
{
    ASSERT(isMainThread());
    ASSERT(!m_defersLoading);

    if (cancelledOrClientless())
        return;

    m_handle->getInternal()->m_response = ResourceResponse(receivedResponse);

    if (m_curlRequest)
        m_handle->getInternal()->m_response.setDeprecatedNetworkLoadMetrics(m_curlRequest->getNetworkLoadMetrics());

    if (response().isMultipart()) {
        String boundary;
        bool parsed = MultipartHandle::extractBoundary(response().httpHeaderField(HTTPHeaderName::ContentType), boundary);
        if (parsed)
            m_multipartHandle = std::make_unique<MultipartHandle>(m_handle, boundary);
    }

    if (response().shouldRedirect()) {
        willSendRequest();
        return;
    }

    if (response().isUnauthorized()) {
        AuthenticationChallenge challenge(receivedResponse, m_authFailureCount, response(), m_handle);
        m_handle->didReceiveAuthenticationChallenge(challenge);
        m_authFailureCount++;
        return;
    }

    if (m_handle->client()) {
        if (response().isNotModified()) {
            URL cacheUrl = m_currentRequest.url();
            cacheUrl.removeFragmentIdentifier();

            if (CurlCacheManager::getInstance().getCachedResponse(cacheUrl, response())) {
                if (m_addedCacheValidationHeaders) {
                    response().setHTTPStatusCode(200);
                    response().setHTTPStatusText("OK");
                }
            }
        }

        CurlCacheManager::getInstance().didReceiveResponse(*m_handle, response());

        auto protectedThis = makeRef(*m_handle);
        m_handle->didReceiveResponse(ResourceResponse(response()));
    }
}

void ResourceHandleCurlDelegate::curlDidReceiveBuffer(Ref<SharedBuffer>&& buffer)
{
    ASSERT(isMainThread());

    if (cancelledOrClientless())
        return;

    if (m_multipartHandle)
        m_multipartHandle->contentReceived(buffer->data(), buffer->size());
    else if (m_handle->client()) {
        CurlCacheManager::getInstance().didReceiveData(*m_handle, buffer->data(), buffer->size());
        m_handle->client()->didReceiveBuffer(m_handle, WTFMove(buffer), buffer->size());
    }
}

void ResourceHandleCurlDelegate::curlDidComplete()
{
    ASSERT(isMainThread());

    if (cancelledOrClientless())
        return;

    if (m_curlRequest)
        m_handle->getInternal()->m_response.setDeprecatedNetworkLoadMetrics(m_curlRequest->getNetworkLoadMetrics());

    if (m_multipartHandle)
        m_multipartHandle->contentEnded();

    if (m_handle->client()) {
        CurlCacheManager::getInstance().didFinishLoading(*m_handle);
        m_handle->client()->didFinishLoading(m_handle);
    }
}

void ResourceHandleCurlDelegate::curlDidFailWithError(const ResourceError& resourceError)
{
    ASSERT(isMainThread());

    if (cancelledOrClientless())
        return;

    CurlCacheManager::getInstance().didFail(*m_handle);
    m_handle->client()->didFail(m_handle, resourceError);
}

void ResourceHandleCurlDelegate::continueDidReceiveResponse()
{
    ASSERT(isMainThread());

    continueAfterDidReceiveResponse();
}

void ResourceHandleCurlDelegate::platformContinueSynchronousDidReceiveResponse()
{
    ASSERT(isMainThread());

    continueAfterDidReceiveResponse();
}

void ResourceHandleCurlDelegate::continueAfterDidReceiveResponse()
{
    ASSERT(isMainThread());

    // continueDidReceiveResponse might cancel the load.
    if (cancelledOrClientless() || !m_curlRequest)
        return;

    m_curlRequest->completeDidReceiveResponse();
}

bool ResourceHandleCurlDelegate::shouldRedirectAsGET(const ResourceRequest& request, bool crossOrigin)
{
    if (request.httpMethod() == "GET" || request.httpMethod() == "HEAD")
        return false;

    if (!request.url().protocolIsInHTTPFamily())
        return true;

    if (response().isSeeOther())
        return true;

    if ((response().isMovedPermanently() || response().isFound()) && (request.httpMethod() == "POST"))
        return true;

    if (crossOrigin && (request.httpMethod() == "DELETE"))
        return true;

    return false;
}

void ResourceHandleCurlDelegate::willSendRequest()
{
    ASSERT(isMainThread());

    static const int maxRedirects = 20;

    if (m_redirectCount++ > maxRedirects) {
        m_handle->client()->didFail(m_handle, ResourceError::httpError(CURLE_TOO_MANY_REDIRECTS, response().url()));
        return;
    }

    String location = response().httpHeaderField(HTTPHeaderName::Location);
    URL newURL = URL(m_firstRequest.url(), location);
    bool crossOrigin = !protocolHostAndPortAreEqual(m_firstRequest.url(), newURL);

    ResourceRequest newRequest = m_firstRequest;
    newRequest.setURL(newURL);

    if (shouldRedirectAsGET(newRequest, crossOrigin)) {
        newRequest.setHTTPMethod("GET");
        newRequest.setHTTPBody(nullptr);
        newRequest.clearHTTPContentType();
    }

    // Should not set Referer after a redirect from a secure resource to non-secure one.
    if (!newURL.protocolIs("https") && protocolIs(newRequest.httpReferrer(), "https") && m_handle->context()->shouldClearReferrerOnHTTPSToHTTPRedirect())
        newRequest.clearHTTPReferrer();

    m_user = newURL.user();
    m_pass = newURL.pass();
    newRequest.removeCredentials();

    if (crossOrigin) {
        // If the network layer carries over authentication headers from the original request
        // in a cross-origin redirect, we want to clear those headers here. 
        newRequest.clearHTTPAuthorization();
        newRequest.clearHTTPOrigin();
    }

    ResourceResponse responseCopy = response();
    if (m_handle->client()->usesAsyncCallbacks())
        m_handle->client()->willSendRequestAsync(m_handle, WTFMove(newRequest), WTFMove(responseCopy));
    else {
        auto request = m_handle->client()->willSendRequest(m_handle, WTFMove(newRequest), WTFMove(responseCopy));
        continueAfterWillSendRequest(WTFMove(request));
    }
}

void ResourceHandleCurlDelegate::continueWillSendRequest(ResourceRequest&& request)
{
    ASSERT(isMainThread());

    continueAfterWillSendRequest(WTFMove(request));
}

void ResourceHandleCurlDelegate::continueAfterWillSendRequest(ResourceRequest&& request)
{
    ASSERT(isMainThread());

    // willSendRequest might cancel the load.
    if (cancelledOrClientless() || !m_curlRequest || request.isNull())
        return;

    m_currentRequest = WTFMove(request);

    bool isSyncRequest = m_curlRequest->isSyncRequest();
    m_curlRequest->cancel();
    m_curlRequest->setDelegate(nullptr);

    m_curlRequest = createCurlRequest(m_currentRequest);

    auto credential = getCredential(m_currentRequest, true);
    if (protocolHostAndPortAreEqual(m_currentRequest.url(), response().url()) && credential) {
        m_curlRequest->setUserPass(credential->user(), credential->password());
    }

    m_curlRequest->start(isSyncRequest);
}

ResourceResponse& ResourceHandleCurlDelegate::response()
{
    return m_handle->getInternal()->m_response;
}

void ResourceHandleCurlDelegate::handleDataURL()
{
    ASSERT(m_firstRequest.url().protocolIsData());
    String url = m_firstRequest.url().string();

    ASSERT(m_handle->client());

    auto index = url.find(',');
    if (index == notFound) {
        m_handle->client()->cannotShowURL(m_handle);
        return;
    }

    String mediaType = url.substring(5, index - 5);
    String data = url.substring(index + 1);
    auto originalSize = data.length();

    bool base64 = mediaType.endsWith(";base64", false);
    if (base64)
        mediaType = mediaType.left(mediaType.length() - 7);

    if (mediaType.isEmpty())
        mediaType = "text/plain";

    String mimeType = extractMIMETypeFromMediaType(mediaType);
    String charset = extractCharsetFromMediaType(mediaType);

    if (charset.isEmpty())
        charset = "US-ASCII";

    ResourceResponse response;
    response.setMimeType(mimeType);
    response.setTextEncodingName(charset);
    response.setURL(m_firstRequest.url());

    if (base64) {
        data = decodeURLEscapeSequences(data);
        m_handle->client()->didReceiveResponse(m_handle, WTFMove(response));

        // didReceiveResponse might cause the client to be deleted.
        if (m_handle->client()) {
            Vector<char> out;
            if (base64Decode(data, out, Base64IgnoreSpacesAndNewLines) && out.size() > 0)
                m_handle->client()->didReceiveBuffer(m_handle, SharedBuffer::create(out.data(), out.size()), originalSize);
        }
    } else {
        TextEncoding encoding(charset);
        data = decodeURLEscapeSequences(data, encoding);
        m_handle->client()->didReceiveResponse(m_handle, WTFMove(response));

        // didReceiveResponse might cause the client to be deleted.
        if (m_handle->client()) {
            CString encodedData = encoding.encode(data, URLEncodedEntitiesForUnencodables);
            if (encodedData.length())
                m_handle->client()->didReceiveBuffer(m_handle, SharedBuffer::create(encodedData.data(), encodedData.length()), originalSize);
        }
    }

    if (m_handle->client())
        m_handle->client()->didFinishLoading(m_handle);
}

std::optional<Credential> ResourceHandleCurlDelegate::getCredential(const ResourceRequest& request, bool redirect)
{
    // m_user/m_pass are credentials given manually, for instance, by the arguments passed to XMLHttpRequest.open().
    Credential credential{ m_user, m_pass, CredentialPersistenceNone };

    if (m_shouldUseCredentialStorage) {
        String partition = request.cachePartition();

        if (credential.isEmpty()) {
            // <rdar://problem/7174050> - For URLs that match the paths of those previously challenged for HTTP Basic authentication, 
            // try and reuse the credential preemptively, as allowed by RFC 2617.
            m_initialCredential = CredentialStorage::defaultCredentialStorage().get(partition, request.url());
        } else if (!redirect) {
            // If there is already a protection space known for the URL, update stored credentials
            // before sending a request. This makes it possible to implement logout by sending an
            // XMLHttpRequest with known incorrect credentials, and aborting it immediately (so that
            // an authentication dialog doesn't pop up).
            CredentialStorage::defaultCredentialStorage().set(partition, credential, request.url());
        }
    }

    if (!m_initialCredential.isEmpty())
        return m_initialCredential;

    return std::nullopt;
}

} // namespace WebCore

#endif
