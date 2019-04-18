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

WI.CanvasTreeElement = class CanvasTreeElement extends WI.FolderizedTreeElement
{
    constructor(representedObject)
    {
        console.assert(representedObject instanceof WI.Canvas);

        const subtitle = null;
        super(["canvas", representedObject.contextType], representedObject.displayName, subtitle, representedObject);

        this.registerFolderizeSettings("shader-programs", WI.UIString("Shader Programs"), this.representedObject.shaderProgramCollection, WI.ShaderProgramTreeElement);
    }

    // Protected

    onattach()
    {
        super.onattach();

        this.representedObject.shaderProgramCollection.addEventListener(WI.Collection.Event.ItemAdded, this._shaderProgramAdded, this);
        this.representedObject.shaderProgramCollection.addEventListener(WI.Collection.Event.ItemRemoved, this._shaderProgramRemoved, this);

        this.element.addEventListener("mouseover", this._handleMouseOver.bind(this));
        this.element.addEventListener("mouseout", this._handleMouseOut.bind(this));

        this.onpopulate();
    }

    ondetach()
    {
        this.representedObject.shaderProgramCollection.removeEventListener(WI.Collection.Event.ItemAdded, this._shaderProgramAdded, this);
        this.representedObject.shaderProgramCollection.removeEventListener(WI.Collection.Event.ItemRemoved, this._shaderProgramRemoved, this);

        super.ondetach();
    }

    onpopulate()
    {
        super.onpopulate();

        if (this.children.length && !this.shouldRefreshChildren)
            return;

        this.shouldRefreshChildren = false;

        this.removeChildren();

        for (let program of this.representedObject.shaderProgramCollection.items)
            this.addChildForRepresentedObject(program);
    }

    populateContextMenu(contextMenu, event)
    {
        super.populateContextMenu(contextMenu, event);

        contextMenu.appendItem(WI.UIString("Log Canvas Context"), () => {
            WI.RemoteObject.resolveCanvasContext(this.representedObject, WI.RuntimeManager.ConsoleObjectGroup, (remoteObject) => {
                if (!remoteObject)
                    return;

                const text = WI.UIString("Selected Canvas Context");
                const addSpecialUserLogClass = true;
                WI.consoleLogViewController.appendImmediateExecutionWithResult(text, remoteObject, addSpecialUserLogClass);
            });
        });

        contextMenu.appendSeparator();
    }

    // Private

    _shaderProgramAdded(event)
    {
        this.addRepresentedObjectToNewChildQueue(event.data.item);
    }

    _shaderProgramRemoved(event)
    {
        this.removeChildForRepresentedObject(event.data.item);
    }

    _handleMouseOver(event)
    {
        if (this.representedObject.cssCanvasName) {
            this.representedObject.requestCSSCanvasClientNodes((cssCanvasClientNodes) => {
                WI.domTreeManager.highlightDOMNodeList(cssCanvasClientNodes.map((node) => node.id), "all");
            });
        } else {
            this.representedObject.requestNode((node) => {
                if (!node || !node.ownerDocument)
                    return;

                WI.domTreeManager.highlightDOMNode(node.id, "all");
            });
        }
    }

    _handleMouseOut(event)
    {
        WI.domTreeManager.hideDOMNodeHighlight();
    }
};
