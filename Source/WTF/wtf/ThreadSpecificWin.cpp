/*
 * Copyright (C) 2009 Jian Li <jianli@chromium.org>
 * Copyright (C) 2012 Patrick Gansterer <paroga@paroga.com>
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
 *
 */

#include "config.h"
#include "ThreadSpecific.h"
#include <wtf/DoublyLinkedList.h>
#include <wtf/HashMap.h>

#if OS(WINDOWS)

#if !USE(PTHREADS)

namespace WTF {

#if BACKPORT_TO_WINXP
long& localStorageKeyCount()
#else
long& flsKeyCount()
#endif
{
    static long count;
    return count;
}

#if BACKPORT_TO_WINXP
DWORD* localStorageKeys()
{
    static DWORD keys[kMaxLocalStorageKeySize];
#else
DWORD* flsKeys()
{
    static DWORD keys[kMaxFlsKeySize];
#endif
    return keys;
}

#if BACKPORT_TO_WINXP

class PlatformThreadSpecificKey;

static DoublyLinkedList<PlatformThreadSpecificKey>& destructorsList()
{
    static DoublyLinkedList<PlatformThreadSpecificKey> staticList;
    return staticList;
}

static Mutex& destructorsMutex()
{
    static Mutex staticMutex;
    return staticMutex;
}

static HashMap<DWORD, PlatformThreadSpecificKey*>& keysMap()
{
    static HashMap<DWORD, PlatformThreadSpecificKey*> staticKeysMap;
    return staticKeysMap;
}

class PlatformThreadSpecificKey : public DoublyLinkedListNode<PlatformThreadSpecificKey> {
public:
    friend class DoublyLinkedListNode<PlatformThreadSpecificKey>;

    PlatformThreadSpecificKey(void(THREAD_SPECIFIC_CALL *destructor)(void *))
        : m_destructor(destructor)
    {
        m_tlsKey = TlsAlloc();
        if (m_tlsKey == TLS_OUT_OF_INDEXES)
            CRASH();
    }

    ~PlatformThreadSpecificKey()
    {
        TlsFree(m_tlsKey);
    }

    void setValue(void* data) { TlsSetValue(m_tlsKey, data); }
    void* value() { return TlsGetValue(m_tlsKey); }
    DWORD getKey() { return m_tlsKey; }

    void callDestructor()
    {
        if (void* data = value())
            m_destructor(data);
    }

private:
    void(THREAD_SPECIFIC_CALL *m_destructor)(void *);
    DWORD m_tlsKey;
    PlatformThreadSpecificKey* m_prev;
    PlatformThreadSpecificKey* m_next;
};

void threadSpecificKeyCreate(ThreadSpecificKey* key, void(THREAD_SPECIFIC_CALL *destructor)(void *))
{
    static FlsAllocPtr flsAlloc = reinterpret_cast<FlsAllocPtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsAlloc"));
    if (flsAlloc)
    {
        DWORD flsKey = flsAlloc(destructor);
        if (flsKey == FLS_OUT_OF_INDEXES)
            CRASH();

        *key = flsKey;
    }
    else // Windows XP
    {
        // Use the original malloc() instead of fastMalloc() to use this function in FastMalloc code.
        PlatformThreadSpecificKey* platformThSpecKey = static_cast<PlatformThreadSpecificKey*>(::malloc(sizeof(PlatformThreadSpecificKey)));
        //*key = static_cast<PlatformThreadSpecificKey*>(::malloc(sizeof(PlatformThreadSpecificKey)));
        *key = platformThSpecKey->getKey();

        keysMap().add(*key, platformThSpecKey);

        new (platformThSpecKey) PlatformThreadSpecificKey(destructor);
        MutexLocker locker(destructorsMutex());
        destructorsList().push(platformThSpecKey);
    }
}

void threadSpecificKeyDelete(ThreadSpecificKey key)
{
    static LSFreePtr flsFree = reinterpret_cast<LSFreePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsFree"));
    if (flsFree)
        flsFree(key);
    else // Windows XP
    {
        MutexLocker locker(destructorsMutex());

        PlatformThreadSpecificKey* platformThSpecKey = keysMap().take(key);
        destructorsList().remove(platformThSpecKey);
        platformThSpecKey->~PlatformThreadSpecificKey();
        ::free(platformThSpecKey);
    }
}

void threadSpecificSet(ThreadSpecificKey key, void* data)
{
    static FlsSetValuePtr flsSetValue = reinterpret_cast<FlsSetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsSetValue"));
    if (flsSetValue)
        flsSetValue(key, data);
    else // Windows XP
        keysMap().get(key)->setValue(data);
}

void* threadSpecificGet(ThreadSpecificKey key)
{
    static FlsGetValuePtr flsGetValue = reinterpret_cast<FlsGetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsGetValue"));
    if (flsGetValue)
        return flsGetValue(key);
    else // Windows XP
        return keysMap().get(key)->value();
}

void ThreadSpecificThreadExit()
{
    for (long i = 0; i < localStorageKeyCount(); i++) {
        // The layout of ThreadSpecific<T>::Data does not depend on T. So we are safe to do the static cast to ThreadSpecific<int> in order to access its data member.
        ThreadSpecific<int>::Data* data = static_cast<ThreadSpecific<int>::Data*>(TlsGetValue(localStorageKeys()[i]));
        if (data)
            data->destructor(data);
    }

    MutexLocker locker(destructorsMutex());
    PlatformThreadSpecificKey* key = destructorsList().head();
    while (key) {
        PlatformThreadSpecificKey* nextKey = key->next();
        key->callDestructor();
        key = nextKey;
    }
}

#else

typedef DWORD ThreadSpecificKey;

static const constexpr ThreadSpecificKey InvalidThreadSpecificKey = FLS_OUT_OF_INDEXES;

inline void threadSpecificKeyCreate(ThreadSpecificKey* key, void (THREAD_SPECIFIC_CALL *destructor)(void *))
{
    DWORD flsKey = FlsAlloc(destructor);
    if (flsKey == FLS_OUT_OF_INDEXES)
        CRASH();

    *key = flsKey;
}

inline void threadSpecificKeyDelete(ThreadSpecificKey key)
{
    FlsFree(key);
}

inline void threadSpecificSet(ThreadSpecificKey key, void* data)
{
    FlsSetValue(key, data);
}

inline void* threadSpecificGet(ThreadSpecificKey key)
{
    return FlsGetValue(key);
}

#endif

} // namespace WTF

#endif // !USE(PTHREADS)

#endif // OS(WINDOWS)
