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

#if HAVE(AVSAMPLEBUFFERGENERATOR)

#include "ImageDecoder.h"
#include <map>
#include <wtf/Lock.h>
#include <wtf/Vector.h>
#include <wtf/text/WTFString.h>

OBJC_CLASS AVAssetTrack;
OBJC_CLASS AVSampleBufferGenerator;
OBJC_CLASS AVSampleCursor;
OBJC_CLASS AVURLAsset;
OBJC_CLASS WebCoreSharedBufferResourceLoaderDelegate;
typedef struct opaqueCMSampleBuffer* CMSampleBufferRef;
typedef struct OpaqueVTImageRotationSession* VTImageRotationSessionRef;
typedef struct __CVPixelBufferPool* CVPixelBufferPoolRef;

namespace WTF {
class MediaTime;
}

namespace WebCore {

class PixelBufferConformerCV;
class WebCoreDecompressionSession;

class ImageDecoderAVFObjC : public ImageDecoder {
public:
    static RefPtr<ImageDecoderAVFObjC> create(SharedBuffer&, const String& mimeType, AlphaOption, GammaAndColorProfileOption);
    virtual ~ImageDecoderAVFObjC();

    size_t bytesDecodedToDetermineProperties() const override { return 0; }
    static bool canDecodeType(const String& mimeType);

    const String& mimeType() const { return m_mimeType; }

    EncodedDataStatus encodedDataStatus() const final;
    IntSize size() const final;
    size_t frameCount() const final;
    RepetitionCount repetitionCount() const final;
    String uti() const final;
    String filenameExtension() const final;
    std::optional<IntPoint> hotSpot() const final { return std::nullopt; }

    IntSize frameSizeAtIndex(size_t, SubsamplingLevel = SubsamplingLevel::Default) const final;
    bool frameIsCompleteAtIndex(size_t) const final;
    ImageOrientation frameOrientationAtIndex(size_t) const final;

    Seconds frameDurationAtIndex(size_t) const final;
    bool frameHasAlphaAtIndex(size_t) const final;
    bool frameAllowSubsamplingAtIndex(size_t) const final;
    unsigned frameBytesAtIndex(size_t, SubsamplingLevel = SubsamplingLevel::Default) const final;

    NativeImagePtr createFrameImageAtIndex(size_t, SubsamplingLevel = SubsamplingLevel::Default, const DecodingOptions& = DecodingMode::Synchronous) final;

    void setExpectedContentSize(long long) final;
    void setData(SharedBuffer&, bool allDataReceived) final;
    bool isAllDataReceived() const final { return m_isAllDataReceived; }
    void clearFrameBufferCache(size_t) final;

    struct RotationProperties {
        bool flipX { false };
        bool flipY { false };
        unsigned angle { 0 };

        bool isIdentity() const { return !flipX && !flipY && !angle; }
    };

private:
    ImageDecoderAVFObjC(SharedBuffer&, const String& mimeType, AlphaOption, GammaAndColorProfileOption);

    AVAssetTrack *firstEnabledTrack();
    void readSampleMetadata();
    void readTrackMetadata();
    bool storeSampleBuffer(CMSampleBufferRef);
    void advanceCursor();
    void setTrack(AVAssetTrack *);

    String m_mimeType;
    String m_uti;
    RetainPtr<AVURLAsset> m_asset;
    RetainPtr<AVAssetTrack> m_track;
    RetainPtr<AVSampleCursor> m_cursor;
    RetainPtr<AVSampleBufferGenerator> m_generator;
    RetainPtr<WebCoreSharedBufferResourceLoaderDelegate> m_loader;
    RetainPtr<VTImageRotationSessionRef> m_rotationSession;
    RetainPtr<CVPixelBufferPoolRef> m_rotationPool;
    Ref<WebCoreDecompressionSession> m_decompressionSession;

    struct SampleData;
    std::map<WTF::MediaTime, size_t> m_presentationTimeToIndex;
    Vector<SampleData> m_sampleData;
    Lock m_sampleGeneratorLock;
    bool m_isAllDataReceived { false };
    std::optional<IntSize> m_size;
    std::optional<RotationProperties> m_rotation;
};

}
#endif
