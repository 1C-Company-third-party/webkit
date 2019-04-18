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
#include "MockPaymentCoordinator.h"

#if ENABLE(APPLE_PAY)

#include "MainFrame.h"
#include "PaymentCoordinator.h"
#include "URL.h"
#include <wtf/RunLoop.h>

namespace WebCore {

MockPaymentCoordinator::MockPaymentCoordinator(MainFrame& mainFrame)
    : m_mainFrame { mainFrame }
{
}

bool MockPaymentCoordinator::supportsVersion(unsigned version)
{
    ASSERT(version > 0);

#if !ENABLE(APPLE_PAY_SESSION_V3)
    static const unsigned currentVersion = 2;
#else
    static const unsigned currentVersion = 3;
#endif

    return version <= currentVersion;
}

bool MockPaymentCoordinator::canMakePayments()
{
    return true;
}

void MockPaymentCoordinator::canMakePaymentsWithActiveCard(const String&, const String&, WTF::Function<void(bool)>&& completionHandler)
{
    RunLoop::main().dispatch([completionHandler = WTFMove(completionHandler)]() {
        completionHandler(true);
    });
}

void MockPaymentCoordinator::openPaymentSetup(const String&, const String&, WTF::Function<void(bool)>&& completionHandler)
{
    RunLoop::main().dispatch([completionHandler = WTFMove(completionHandler)]() {
        completionHandler(true);
    });
}

bool MockPaymentCoordinator::showPaymentUI(const URL&, const Vector<URL>&, const ApplePaySessionPaymentRequest&)
{
    RunLoop::main().dispatch([mainFrame = makeRef(m_mainFrame)]() {
        mainFrame->paymentCoordinator().validateMerchant({ URL(), ASCIILiteral("https://webkit.org/") });
    });
    return true;
}

void MockPaymentCoordinator::paymentCoordinatorDestroyed()
{
    delete this;
}

} // namespace WebCore

#endif // ENABLE(APPLE_PAY)
