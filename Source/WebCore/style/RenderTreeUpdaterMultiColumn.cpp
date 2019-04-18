/*
 * Copyright (C) 1999 Lars Knoll (knoll@kde.org)
 *           (C) 1999 Antti Koivisto (koivisto@kde.org)
 *           (C) 2007 David Smith (catfish.man@gmail.com)
 * Copyright (C) 2003-2015, 2017 Apple Inc. All rights reserved.
 * Copyright (C) Research In Motion Limited 2010. All rights reserved.
 *
 * This library is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Library General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Library General Public License for more details.
 *
 * You should have received a copy of the GNU Library General Public License
 * along with this library; see the file COPYING.LIB.  If not, write to
 * the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
 * Boston, MA 02110-1301, USA.
 */

#include "config.h"
#include "RenderTreeUpdaterMultiColumn.h"

#include "RenderBlockFlow.h"
#include "RenderChildIterator.h"
#include "RenderMultiColumnFlow.h"
#include "RenderMultiColumnSet.h"
#include "RenderMultiColumnSpannerPlaceholder.h"

namespace WebCore {

void RenderTreeUpdater::MultiColumn::update(RenderBlockFlow& flow)
{
    bool needsFragmentedFlow = flow.requiresColumns(flow.style().columnCount());
    bool hasFragmentedFlow = flow.multiColumnFlow();

    if (!hasFragmentedFlow && needsFragmentedFlow) {
        createFragmentedFlow(flow);
        return;
    }
    if (hasFragmentedFlow && !needsFragmentedFlow) {
        destroyFragmentedFlow(flow);
        return;
    }
}

void RenderTreeUpdater::MultiColumn::createFragmentedFlow(RenderBlockFlow& flow)
{
    auto newFragmentedFlow = WebCore::createRenderer<RenderMultiColumnFlow>(flow.document(), RenderStyle::createAnonymousStyleWithDisplay(flow.style(), BLOCK));
    newFragmentedFlow->initializeStyle();
    flow.setChildrenInline(false); // Do this to avoid wrapping inline children that are just going to move into the flow thread.
    flow.deleteLines();
    auto& fragmentedFlow = *newFragmentedFlow;
    flow.RenderBlock::addChild(WTFMove(newFragmentedFlow));

    // Reparent children preceding the fragmented flow into the fragmented flow.
    flow.moveChildrenTo(&fragmentedFlow, flow.firstChild(), &fragmentedFlow, true);
    if (flow.isFieldset()) {
        // Keep legends out of the flow thread.
        for (auto& box : childrenOfType<RenderBox>(fragmentedFlow)) {
            if (box.isLegend())
                fragmentedFlow.moveChildTo(&flow, &box, true);
        }
    }

    flow.setMultiColumnFlow(fragmentedFlow);
}

void RenderTreeUpdater::MultiColumn::destroyFragmentedFlow(RenderBlockFlow& flow)
{
    auto& fragmentedFlow = *flow.multiColumnFlow();
    flow.clearMultiColumnFlow();

    fragmentedFlow.deleteLines();
    fragmentedFlow.moveAllChildrenTo(&flow, true);

    // Move spanners back to their original DOM position in the tree, and destroy the placeholders.
    auto spannerMap = fragmentedFlow.takeSpannerMap();
    for (auto& spannerAndPlaceholder : *spannerMap) {
        RenderBox& spanner = *spannerAndPlaceholder.key;
        auto& placeholder = *spannerAndPlaceholder.value;
        auto takenSpanner = flow.takeChild(spanner);
        placeholder.parent()->addChild(WTFMove(takenSpanner), &placeholder);
        placeholder.removeFromParentAndDestroy();
    }

    while (auto* columnSet = fragmentedFlow.firstMultiColumnSet())
        columnSet->removeFromParentAndDestroy();

    fragmentedFlow.removeFromParentAndDestroy();
}

}
