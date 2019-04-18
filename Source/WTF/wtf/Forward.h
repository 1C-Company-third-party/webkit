/*
 *  Copyright (C) 2006, 2009, 2011 Apple Inc. All rights reserved.
 *
 *  This library is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Library General Public
 *  License as published by the Free Software Foundation; either
 *  version 2 of the License, or (at your option) any later version.
 *
 *  This library is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Library General Public License for more details.
 *
 *  You should have received a copy of the GNU Library General Public License
 *  along with this library; see the file COPYING.LIB.  If not, write to
 *  the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
 *  Boston, MA 02110-1301, USA.
 *
 */

#pragma once

#include <stddef.h>

namespace std {
template<typename T> class optional;
}

namespace WTF {

class AtomicString;
class AtomicStringImpl;
class BinarySemaphore;
class CString;
class CrashOnOverflow;
class FunctionDispatcher;
class OrdinalNumber;
class PrintStream;
class SHA1;
class String;
class StringBuilder;
class StringImpl;
class StringView;
class TextPosition;

struct FastMalloc;

template<typename> class CompletionHandler;
template<typename> class Function;
template<typename> class LazyNeverDestroyed;
template<typename> class NeverDestroyed;
template<typename> class OptionSet;
template<typename> class Ref;
template<typename> class RefPtr;
template<typename> class StringBuffer;

template<typename> struct DefaultHash { using Hash = void; };
template<typename> struct HashTraits;

template<typename...> class Variant;
template<class, class> class Expected;
template<typename, size_t = 0, typename = CrashOnOverflow, size_t = 16, typename = FastMalloc> class Vector;
template<typename Value, typename = typename DefaultHash<Value>::Hash, typename = HashTraits<Value>> class HashCountedSet;
template<typename KeyArg, typename MappedArg, typename = typename DefaultHash<KeyArg>::Hash, typename = HashTraits<KeyArg>, typename = HashTraits<MappedArg>> class HashMap;
template<typename ValueArg, typename = typename DefaultHash<ValueArg>::Hash, typename = HashTraits<ValueArg>> class HashSet;

}

using WTF::AtomicString;
using WTF::AtomicStringImpl;
using WTF::BinarySemaphore;
using WTF::CompletionHandler;
using WTF::CString;
using WTF::Expected;
using WTF::Function;
using WTF::FunctionDispatcher;
using WTF::HashCountedSet;
using WTF::HashMap;
using WTF::HashSet;
using WTF::LazyNeverDestroyed;
using WTF::NeverDestroyed;
using WTF::OptionSet;
using WTF::OrdinalNumber;
using WTF::PrintStream;
using WTF::Ref;
using WTF::RefPtr;
using WTF::SHA1;
using WTF::String;
using WTF::StringBuffer;
using WTF::StringBuilder;
using WTF::StringImpl;
using WTF::StringView;
using WTF::TextPosition;
using WTF::Variant;
using WTF::Vector;
