/*
 * Copyright (C) 2017 Apple Inc. All rights reserved.
 * Copyright (C) 2017 Igalia S.L.
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
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
 * ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

#include "config.h"
#include "ComplexTextController.h"

#include "FontCascade.h"
#include "HbUniquePtr.h"
#include "SurrogatePairAwareTextIterator.h"
#include <hb-icu.h>

namespace WebCore {

static inline float harfBuzzPositionToFloat(hb_position_t value)
{
    return static_cast<float>(value) / (1 << 16);
}

ComplexTextController::ComplexTextRun::ComplexTextRun(hb_buffer_t* buffer, const Font& font, const UChar* characters, unsigned stringLocation, unsigned stringLength, unsigned indexBegin, unsigned indexEnd, bool ltr)
    : m_initialAdvance(0, 0)
    , m_font(font)
    , m_characters(characters)
    , m_stringLength(stringLength)
    , m_indexBegin(indexBegin)
    , m_indexEnd(indexEnd)
    , m_glyphCount(hb_buffer_get_length(buffer))
    , m_stringLocation(stringLocation)
    , m_isLTR(ltr)
{
    if (!m_glyphCount)
        return;

    m_glyphs.grow(m_glyphCount);
    m_baseAdvances.grow(m_glyphCount);
    m_glyphOrigins.grow(m_glyphCount);
    m_coreTextIndices.grow(m_glyphCount);

    hb_glyph_info_t* glyphInfos = hb_buffer_get_glyph_infos(buffer, nullptr);
    hb_glyph_position_t* glyphPositions = hb_buffer_get_glyph_positions(buffer, nullptr);

    // HarfBuzz returns the shaping result in visual order. We don't need to flip for RTL.
    for (unsigned i = 0; i < m_glyphCount; ++i) {
        m_coreTextIndices[i] = glyphInfos[i].cluster;

        uint16_t glyph = glyphInfos[i].codepoint;
        if (m_font.isZeroWidthSpaceGlyph(glyph)) {
            m_glyphs[i] = glyph;
            m_baseAdvances[i] = { };
            m_glyphOrigins[i] = { };
            continue;
        }

        float offsetX = harfBuzzPositionToFloat(glyphPositions[i].x_offset);
        float offsetY = -harfBuzzPositionToFloat(glyphPositions[i].y_offset);
        float advanceX = harfBuzzPositionToFloat(glyphPositions[i].x_advance);
        float advanceY = harfBuzzPositionToFloat(glyphPositions[i].y_advance);

        m_glyphs[i] = glyph;
        m_baseAdvances[i] = { advanceX, advanceY };
        m_glyphOrigins[i] = { offsetX, offsetY };
    }
}

static const unsigned hbEnd = static_cast<unsigned>(-1);

static Vector<hb_feature_t, 4> fontFeatures(const FontCascade& font, FontOrientation orientation)
{
    Vector<hb_feature_t, 4> features;

    if (orientation == Vertical) {
        features.append({ HarfBuzzFace::vertTag, 1, 0, hbEnd });
        features.append({ HarfBuzzFace::vrt2Tag, 1, 0, hbEnd });
    }

    hb_feature_t kerning = { HarfBuzzFace::kernTag, 0, 0, hbEnd };
    if (font.enableKerning())
        kerning.value = 1;
    features.append(WTFMove(kerning));

    for (auto& feature : font.fontDescription().featureSettings()) {
        auto& tag = feature.tag();
        features.append({ HB_TAG(tag[0], tag[1], tag[2], tag[3]), static_cast<uint32_t>(feature.value()), 0, hbEnd });
    }

    return features;
}

static std::optional<UScriptCode> characterScript(UChar32 character)
{
    UErrorCode errorCode = U_ZERO_ERROR;
    UScriptCode script = uscript_getScript(character, &errorCode);
    if (U_FAILURE(errorCode))
        return std::nullopt;
    return script;
}

static bool scriptsAreCompatibleForCharacters(UScriptCode script, UScriptCode previousScript, UChar32 character, UChar32 previousCharacter)
{
    if (script == previousScript)
        return true;

    if (script == USCRIPT_INHERITED || previousScript == USCRIPT_COMMON)
        return true;

    if (script == USCRIPT_COMMON) {
        // §5.1 Handling Characters with the Common Script Property.
        // Programs must resolve any of the special Script property values, such as Common,
        // based on the context of the surrounding characters. A simple heuristic uses the
        // script of the preceding character, which works well in many cases.
        // http://www.unicode.org/reports/tr24/#Common.
        //
        // FIXME: cover all other cases mentioned in the spec (ie. brackets or quotation marks).
        // https://bugs.webkit.org/show_bug.cgi?id=177003.
        //
        // We use a slightly more conservative heuristic than the one proposed in the spec,
        // using the script of the previous character only if both are ASCII.
        if (isASCII(character) && isASCII(previousCharacter))
            return true;
    }

    return uscript_hasScript(character, previousScript);
}

struct HBRun {
    unsigned startIndex;
    unsigned endIndex;
    UScriptCode script;
};

static std::optional<HBRun> findNextRun(const UChar* characters, unsigned length, unsigned offset)
{
    SurrogatePairAwareTextIterator textIterator(characters + offset, offset, length, length);
    UChar32 character;
    unsigned clusterLength = 0;
    if (!textIterator.consume(character, clusterLength))
        return std::nullopt;

    auto currentScript = characterScript(character);
    if (!currentScript)
        return std::nullopt;

    unsigned startIndex = offset;
    UChar32 previousCharacter = character;
    for (textIterator.advance(clusterLength); textIterator.consume(character, clusterLength); previousCharacter = character, textIterator.advance(clusterLength)) {
        if (FontCascade::treatAsZeroWidthSpace(character))
            continue;

        auto nextScript = characterScript(character);
        if (!nextScript)
            return std::nullopt;

        if (!scriptsAreCompatibleForCharacters(nextScript.value(), currentScript.value(), character, previousCharacter))
            return std::optional<HBRun>({ startIndex, textIterator.currentIndex(), currentScript.value() });
    }

    return std::optional<HBRun>({ startIndex, textIterator.currentIndex(), currentScript.value() });
}

void ComplexTextController::collectComplexTextRunsForCharacters(const UChar* characters, unsigned length, unsigned stringLocation, const Font* font)
{
    if (!font) {
        // Create a run of missing glyphs from the primary font.
        m_complexTextRuns.append(ComplexTextRun::create(m_font.primaryFont(), characters, stringLocation, length, 0, length, m_run.ltr()));
        return;
    }

    Vector<HBRun> runList;
    unsigned offset = 0;
    while (offset < length) {
        auto run = findNextRun(characters, length, offset);
        if (!run)
            break;
        runList.append(run.value());
        offset = run->endIndex;
    }

    size_t runCount = runList.size();
    if (!runCount)
        return;

    const auto& fontPlatformData = font->platformData();
    auto features = fontFeatures(m_font, fontPlatformData.orientation());
    HbUniquePtr<hb_buffer_t> buffer(hb_buffer_create());
    hb_buffer_set_unicode_funcs(buffer.get(), hb_icu_get_unicode_funcs());

    for (unsigned i = 0; i < runCount; ++i) {
        auto& run = runList[m_run.rtl() ? runCount - i - 1 : i];

        hb_buffer_set_script(buffer.get(), hb_icu_script_to_script(run.script));
        if (!m_mayUseNaturalWritingDirection || m_run.directionalOverride())
            hb_buffer_set_direction(buffer.get(), m_run.rtl() ? HB_DIRECTION_RTL : HB_DIRECTION_LTR);
        else {
            // Leaving direction to HarfBuzz to guess is *really* bad, but will do for now.
            hb_buffer_guess_segment_properties(buffer.get());
        }
        hb_buffer_add_utf16(buffer.get(), reinterpret_cast<const uint16_t*>(characters), length, run.startIndex, run.endIndex - run.startIndex);

        HarfBuzzFace* face = fontPlatformData.harfBuzzFace();
        ASSERT(face);
        if (fontPlatformData.orientation() == Vertical)
            face->setScriptForVerticalGlyphSubstitution(buffer.get());

        HbUniquePtr<hb_font_t> harfBuzzFont(face->createFont());
        hb_shape(harfBuzzFont.get(), buffer.get(), features.isEmpty() ? nullptr : features.data(), features.size());
        m_complexTextRuns.append(ComplexTextRun::create(buffer.get(), *font, characters, stringLocation, length, run.startIndex, run.endIndex, m_run.ltr()));
        hb_buffer_reset(buffer.get());
    }
}

} // namespace WebCore
