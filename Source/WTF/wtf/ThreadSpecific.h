/*
 * Copyright (C) 2008, 2016 Apple Inc. All rights reserved.
 * Copyright (C) 2009 Jian Li <jianli@chromium.org>
 * Copyright (C) 2012 Patrick Gansterer <paroga@paroga.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer. 
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution. 
 * 3.  Neither the name of Apple Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission. 
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* Thread local storage is implemented by using either pthread API or Windows
 * native API. There is subtle semantic discrepancy for the cleanup function
 * implementation as noted below:
 *   @ In pthread implementation, the destructor function will be called
 *     repeatedly if there is still non-NULL value associated with the function.
 *   @ In Windows native implementation, the destructor function will be called
 *     only once.
 * This semantic discrepancy does not impose any problem because nowhere in
 * WebKit the repeated call bahavior is utilized.
 */

#ifndef WTF_ThreadSpecific_h
#define WTF_ThreadSpecific_h

#include <wtf/MainThread.h>
#include <wtf/Noncopyable.h>
#include <wtf/StdLibExtras.h>

#if USE(PTHREADS)
#include <pthread.h>

#if OS(HURD)
// PTHREAD_KEYS_MAX is not defined in bionic nor in Hurd, so explicitly define it here.
#define PTHREAD_KEYS_MAX 1024
#else
#include <limits.h>
#endif

#elif OS(WINDOWS)
#include <windows.h>
#endif

namespace WTF {

#if OS(WINDOWS) && CPU(X86)
#define THREAD_SPECIFIC_CALL __stdcall
#else
#define THREAD_SPECIFIC_CALL
#endif

// Used r173949 for backporting ThreadScpecific.h
#define BACKPORT_TO_WINXP 1

#if OS(WINDOWS) && BACKPORT_TO_WINXP
    // ThreadSpecificThreadExit should be called each time when a thread is detached.
    // This is done automatically for threads created with WTF::createThread.
    void ThreadSpecificThreadExit();
#endif

enum class CanBeGCThread {
    False,
    True
};

template<typename T, CanBeGCThread canBeGCThread = CanBeGCThread::False> class ThreadSpecific {
    WTF_MAKE_NONCOPYABLE(ThreadSpecific);
public:
    ThreadSpecific();
    bool isSet(); // Useful as a fast check to see if this thread has set this value.
    T* operator->();
    operator T*();
    T& operator*();

private:
#if OS(WINDOWS) && BACKPORT_TO_WINXP
    friend void ThreadSpecificThreadExit();
#endif

    // Not implemented. It's technically possible to destroy a thread specific key, but one would need
    // to make sure that all values have been destroyed already (usually, that all threads that used it
    // have exited). It's unlikely that any user of this call will be in that situation - and having
    // a destructor defined can be confusing, given that it has such strong pre-requisites to work correctly.
    ~ThreadSpecific();

    struct Data {
        WTF_MAKE_NONCOPYABLE(Data);
        WTF_MAKE_FAST_ALLOCATED;
    public:
        using PointerType = std::remove_const_t<T>*;

        Data(ThreadSpecific<T, canBeGCThread>* owner)
            : owner(owner)
        {
            // Set up thread-specific value's memory pointer before invoking constructor, in case any function it calls
            // needs to access the value, to avoid recursion.
            owner->setInTLS(this);
            new (NotNull, storagePointer()) T;
        }

        ~Data()
        {
            storagePointer()->~T();
            owner->setInTLS(nullptr);
        }

        PointerType storagePointer() const { return const_cast<PointerType>(reinterpret_cast<const T*>(&m_storage)); }

        std::aligned_storage_t<sizeof(T), std::alignment_of<T>::value> m_storage;
        ThreadSpecific<T, canBeGCThread>* owner;

        void(*destructor)(void*);
    };

    T* get();
    T* set();
#if BACKPORT_TO_WINXP
    void set(T*);
#endif
    void setInTLS(Data*);
    void static THREAD_SPECIFIC_CALL destroy(void* ptr);

#if USE(PTHREADS)
    pthread_key_t m_key;
#elif OS(WINDOWS)
    int m_index;
#endif
};

#if USE(PTHREADS)

typedef pthread_key_t ThreadSpecificKey;

static const constexpr ThreadSpecificKey InvalidThreadSpecificKey = PTHREAD_KEYS_MAX;

inline void threadSpecificKeyCreate(ThreadSpecificKey* key, void (*destructor)(void *))
{
    int error = pthread_key_create(key, destructor);
    if (error)
        CRASH();
}

inline void threadSpecificKeyDelete(ThreadSpecificKey key)
{
    int error = pthread_key_delete(key);
    if (error)
        CRASH();
}

inline void threadSpecificSet(ThreadSpecificKey key, void* value)
{
    pthread_setspecific(key, value);
}

inline void* threadSpecificGet(ThreadSpecificKey key)
{
    return pthread_getspecific(key);
}

template<typename T, CanBeGCThread canBeGCThread>
inline ThreadSpecific<T, canBeGCThread>::ThreadSpecific()
{
    int error = pthread_key_create(&m_key, destroy);
    if (error)
        CRASH();
}

template<typename T, CanBeGCThread canBeGCThread>
inline T* ThreadSpecific<T, canBeGCThread>::get()
{
    Data* data = static_cast<Data*>(pthread_getspecific(m_key));
    if (data)
        return data->storagePointer();
    return nullptr;
}

template<typename T, CanBeGCThread canBeGCThread>
inline void ThreadSpecific<T, canBeGCThread>::setInTLS(Data* data)
{
    pthread_setspecific(m_key, data);
}

#elif OS(WINDOWS)

#if BACKPORT_TO_WINXP
// The maximum number of FLS/TLS keys that can be created. For simplification, we assume that:
// 1) Once the instance of ThreadSpecific<> is created, it will not be destructed until the program dies.
// 2) We do not need to hold many instances of ThreadSpecific<> data. This fixed number should be far enough.
const int kMaxLocalStorageKeySize = 128;

WTF_EXPORT_PRIVATE long& localStorageKeyCount();
WTF_EXPORT_PRIVATE DWORD* localStorageKeys();

typedef DWORD ThreadSpecificKey;

static const constexpr ThreadSpecificKey InvalidThreadSpecificKey = FLS_OUT_OF_INDEXES;

WTF_EXPORT_PRIVATE void threadSpecificKeyCreate(ThreadSpecificKey*, void(THREAD_SPECIFIC_CALL *)(void *)); // maybe THREAD_SPECIFIC_CALL should be only for fls
WTF_EXPORT_PRIVATE void threadSpecificKeyDelete(ThreadSpecificKey);
WTF_EXPORT_PRIVATE void threadSpecificSet(ThreadSpecificKey, void*);
WTF_EXPORT_PRIVATE void* threadSpecificGet(ThreadSpecificKey);

#else
// The maximum number of FLS keys that can be created. For simplification, we assume that:
// 1) Once the instance of ThreadSpecific<> is created, it will not be destructed until the program dies.
// 2) We do not need to hold many instances of ThreadSpecific<> data. This fixed number should be far enough.
const int kMaxFlsKeySize = 128;

WTF_EXPORT_PRIVATE long& flsKeyCount();
WTF_EXPORT_PRIVATE DWORD* flsKeys();

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

#if BACKPORT_TO_WINXP
typedef DWORD(WINAPI* FlsAllocPtr)(PFLS_CALLBACK_FUNCTION);
typedef DWORD(WINAPI* TlsAllocPtr)();

typedef BOOL(WINAPI* LSFreePtr)(DWORD);

typedef LPVOID(WINAPI* TlsGetValuePtr)(DWORD);
typedef PVOID(WINAPI* FlsGetValuePtr)(DWORD);

typedef BOOL(WINAPI* FlsSetValuePtr)(DWORD, PVOID);
typedef BOOL(WINAPI* TlsSetValuePtr)(DWORD, LPVOID);
#endif

template<typename T, CanBeGCThread canBeGCThread>
inline ThreadSpecific<T, canBeGCThread>::ThreadSpecific()
    : m_index(-1)
{
#if BACKPORT_TO_WINXP
    DWORD localStorageKey;
    static FlsAllocPtr flsAlloc = reinterpret_cast<FlsAllocPtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsAlloc"));

    if (flsAlloc)
    {
        localStorageKey = flsAlloc(destroy);

        if (localStorageKey == FLS_OUT_OF_INDEXES)
            CRASH();
    }
    else
    {
        static TlsAllocPtr tlsAlloc = reinterpret_cast<TlsAllocPtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "TlsAlloc"));

        localStorageKey = tlsAlloc();

        if (localStorageKey == TLS_OUT_OF_INDEXES)
            CRASH();
    }

    m_index = InterlockedIncrement(&localStorageKeyCount()) - 1;
    if (m_index >= kMaxLocalStorageKeySize)
        CRASH();
    localStorageKeys()[m_index] = localStorageKey;
#else
    DWORD flsKey = FlsAlloc(destroy);

    if (flsKey == FLS_OUT_OF_INDEXES)
        CRASH();

    m_index = InterlockedIncrement(&flsKeyCount()) - 1;
    if (m_index >= kMaxFlsKeySize)
        CRASH();
    flsKeys()[m_index] = flsKey;
#endif
}

template<typename T, CanBeGCThread canBeGCThread>
inline ThreadSpecific<T, canBeGCThread>::~ThreadSpecific()
{
#if BACKPORT_TO_WINXP
    static LSFreePtr lsFree = reinterpret_cast<LSFreePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsFree"));
    if (!lsFree)
        lsFree = reinterpret_cast<LSFreePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "TlsFree"));
    lsFree(localStorageKeys()[m_index]);
#else
    FlsFree(flsKeys()[m_index]);
#endif
}

template<typename T, CanBeGCThread canBeGCThread>
inline T* ThreadSpecific<T, canBeGCThread>::get()
{
#if BACKPORT_TO_WINXP
    Data* data;
    static FlsGetValuePtr flsGetValue = reinterpret_cast<FlsGetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsGetValue"));
    if (flsGetValue)
        data = static_cast<Data*>(flsGetValue(localStorageKeys()[m_index]));
    else
    {
        static TlsGetValuePtr tlsGetValue = reinterpret_cast<TlsGetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "TlsGetValue"));
        data = static_cast<Data*>(tlsGetValue(localStorageKeys()[m_index]));
    }

    if (data)
        return data->storagePointer();
    return nullptr;
#else
    Data* data = static_cast<Data*>(FlsGetValue(flsKeys()[m_index]));
    if (data)
        return data->storagePointer();
    return nullptr;
#endif
}

template<typename T, CanBeGCThread canBeGCThread>
inline void ThreadSpecific<T, canBeGCThread>::setInTLS(Data* data)
{
    static FlsSetValuePtr flsSetValue = reinterpret_cast<FlsSetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "FlsSetValue"));
    if (flsSetValue)
        flsSetValue(localStorageKeys()[m_index], data);
    else
    {
        static TlsSetValuePtr tlsSetValue = reinterpret_cast<TlsSetValuePtr>(::GetProcAddress(::GetModuleHandle(TEXT("kernel32.dll")), "TlsSetValue"));
        tlsSetValue(localStorageKeys()[m_index], data);
    }
}

#else
#error ThreadSpecific is not implemented for this platform.
#endif

template<typename T, CanBeGCThread canBeGCThread>
inline void THREAD_SPECIFIC_CALL ThreadSpecific<T, canBeGCThread>::destroy(void* ptr)
{
    Data* data = static_cast<Data*>(ptr);

#if USE(PTHREADS)
    // We want get() to keep working while data destructor works, because it can be called indirectly by the destructor.
    // Some pthreads implementations zero out the pointer before calling destroy(), so we temporarily reset it.
    pthread_setspecific(data->owner->m_key, ptr);
#endif

    delete data;
}

template<typename T, CanBeGCThread canBeGCThread>
inline T* ThreadSpecific<T, canBeGCThread>::set()
{
    RELEASE_ASSERT(canBeGCThread == CanBeGCThread::True || !mayBeGCThread());
    ASSERT(!get());
    Data* data = new Data(this); // Data will set itself into TLS.
    ASSERT(get() == data->storagePointer());
    return data->storagePointer();
}

template<typename T, CanBeGCThread canBeGCThread>
inline bool ThreadSpecific<T, canBeGCThread>::isSet()
{
    return !!get();
}

template<typename T, CanBeGCThread canBeGCThread>
inline ThreadSpecific<T, canBeGCThread>::operator T*()
{
    if (T* ptr = get())
        return ptr;
    return set();
}

template<typename T, CanBeGCThread canBeGCThread>
inline T* ThreadSpecific<T, canBeGCThread>::operator->()
{
    return operator T*();
}

template<typename T, CanBeGCThread canBeGCThread>
inline T& ThreadSpecific<T, canBeGCThread>::operator*()
{
    return *operator T*();
}

} // namespace WTF

using WTF::ThreadSpecific;

#endif // WTF_ThreadSpecific_h
