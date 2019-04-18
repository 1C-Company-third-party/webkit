#!/usr/bin/env python
#
# Copyright (c) 2017 Apple Inc. All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions
# are met:
# 1. Redistributions of source code must retain the above copyright
#    notice, this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright
#    notice, this list of conditions and the following disclaimer in the
#    documentation and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY APPLE INC. AND ITS CONTRIBUTORS ``AS IS''
# AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
# THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
# PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL APPLE INC. OR ITS CONTRIBUTORS
# BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
# CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
# SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
# INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
# CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
# ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
# THE POSSIBILITY OF SUCH DAMAGE.

import os.path

from Settings import license, makeSetterFunctionName, makeConditionalString, mapToIDLType, makeConditionalString


def generateInternalSettingsImplementationFile(outputDirectory, settings):
    outputPath = os.path.join(outputDirectory, "InternalSettingsGenerated.cpp")
    outputFile = open(outputPath, 'w')
    outputFile.write(license())

    outputFile.write("#include \"config.h\"\n")
    outputFile.write("#include \"InternalSettingsGenerated.h\"\n\n")

    outputFile.write("#include \"Page.h\"\n")
    outputFile.write("#include \"Settings.h\"\n\n")

    outputFile.write("namespace WebCore {\n\n")

    outputFile.write("InternalSettingsGenerated::InternalSettingsGenerated(Page* page)\n")
    outputFile.write("    : m_page(page)\n")

    for settingName in sorted(settings.iterkeys()):
        setting = settings[settingName]
        idlType = mapToIDLType(setting)
        if not idlType:
            continue

        if setting.conditional:
            outputFile.write("#if " + makeConditionalString(setting.conditional) + "\n")

        outputFile.write("    , m_" + setting.name + "(page->settings()." + setting.name + "())\n")

        if setting.conditional:
            outputFile.write("#endif\n")

    outputFile.write("{\n")
    outputFile.write("}\n\n")

    outputFile.write("InternalSettingsGenerated::~InternalSettingsGenerated()\n")
    outputFile.write("{\n")
    outputFile.write("}\n\n")

    outputFile.write("void InternalSettingsGenerated::resetToConsistentState()\n")
    outputFile.write("{\n")

    for settingName in sorted(settings.iterkeys()):
        setting = settings[settingName]
        idlType = mapToIDLType(setting)
        if not idlType:
            continue

        if setting.conditional:
            outputFile.write("#if " + makeConditionalString(setting.conditional) + "\n")

        outputFile.write("    m_page->settings()." + makeSetterFunctionName(setting) + "(m_" + setting.name + ");\n")

        if setting.conditional:
            outputFile.write("#endif\n")

    outputFile.write("}\n\n")

    for settingName in sorted(settings.iterkeys()):
        setting = settings[settingName]
        idlType = mapToIDLType(setting)
        if not idlType:
            continue

        type = "const String&" if setting.type == "String" else setting.type

        outputFile.write("void InternalSettingsGenerated::" + makeSetterFunctionName(setting) + "(" + type + " " + setting.name + ")\n")
        outputFile.write("{\n")

        if setting.conditional:
            outputFile.write("#if " + makeConditionalString(setting.conditional) + "\n")

        outputFile.write("    m_page->settings()." + makeSetterFunctionName(setting) + "(" + setting.name + ");\n")

        if setting.conditional:
            outputFile.write("#else\n")
            outputFile.write("    UNUSED_PARAM(" + setting.name + ");\n")
            outputFile.write("#endif\n")

        outputFile.write("}\n\n")

    outputFile.write("} // namespace WebCore\n")

    outputFile.close()
