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
#import "WebItemProviderPasteboard.h"

#if ENABLE(DATA_INTERACTION)

#import <Foundation/NSItemProvider.h>
#import <Foundation/NSProgress.h>
#import <MobileCoreServices/MobileCoreServices.h>
#import <UIKit/NSItemProvider+UIKitAdditions.h>
#import <UIKit/UIColor.h>
#import <UIKit/UIImage.h>
#import <WebCore/FileSystem.h>
#import <WebCore/Pasteboard.h>
#import <pal/spi/ios/UIKitSPI.h>
#import <wtf/BlockPtr.h>
#import <wtf/OSObjectPtr.h>
#import <wtf/RetainPtr.h>
#import <wtf/SoftLinking.h>

SOFT_LINK_FRAMEWORK(UIKit)
SOFT_LINK_CLASS(UIKit, UIColor)
SOFT_LINK_CLASS(UIKit, UIImage)
SOFT_LINK_CLASS(UIKit, UIItemProvider)

typedef void(^ItemProviderDataLoadCompletionHandler)(NSData *, NSError *);
typedef NSMutableDictionary<NSString *, NSURL *> TypeToFileURLMap;

using WebCore::Pasteboard;
using WebCore::PasteboardCustomData;
@interface WebItemProviderRegistrationInfo ()
{
    RetainPtr<id <UIItemProviderWriting>> _representingObject;
    RetainPtr<NSString> _typeIdentifier;
    RetainPtr<NSData> _data;
}
@end

@implementation WebItemProviderRegistrationInfo

- (instancetype)initWithRepresentingObject:(id <UIItemProviderWriting>)representingObject typeIdentifier:(NSString *)typeIdentifier data:(NSData *)data
{
    if (representingObject)
        ASSERT(!typeIdentifier && !data);
    else
        ASSERT(typeIdentifier && data);

    if (self = [super init]) {
        _representingObject = representingObject;
        _typeIdentifier = typeIdentifier;
        _data = data;
    }
    return self;
}

- (id <UIItemProviderWriting>)representingObject
{
    return _representingObject.get();
}

- (NSString *)typeIdentifier
{
    return _typeIdentifier.get();
}

- (NSData *)data
{
    return _data.get();
}

@end

@interface WebItemProviderRegistrationInfoList ()
{
    RetainPtr<NSMutableArray> _representations;
}
@end

@implementation WebItemProviderRegistrationInfoList

- (instancetype)init
{
    if (self = [super init]) {
        _representations = adoptNS([[NSMutableArray alloc] init]);
        _preferredPresentationSize = CGSizeZero;
        _preferredPresentationStyle = WebPreferredPresentationStyleUnspecified;
    }

    return self;
}

- (void)dealloc
{
    [_suggestedName release];
    [super dealloc];
}

- (void)addData:(NSData *)data forType:(NSString *)typeIdentifier
{
    [_representations addObject:[[[WebItemProviderRegistrationInfo alloc] initWithRepresentingObject:nil typeIdentifier:typeIdentifier data:data] autorelease]];
}

- (void)addRepresentingObject:(id <UIItemProviderWriting>)object
{
    ASSERT([object conformsToProtocol:@protocol(UIItemProviderWriting)]);
    [_representations addObject:[[[WebItemProviderRegistrationInfo alloc] initWithRepresentingObject:object typeIdentifier:nil data:nil] autorelease]];
}

- (NSUInteger)numberOfItems
{
    return [_representations count];
}

- (WebItemProviderRegistrationInfo *)itemAtIndex:(NSUInteger)index
{
    if (index >= self.numberOfItems)
        return nil;

    return [_representations objectAtIndex:index];
}

- (void)enumerateItems:(void (^)(WebItemProviderRegistrationInfo *, NSUInteger))block
{
    for (NSUInteger index = 0; index < self.numberOfItems; ++index)
        block([self itemAtIndex:index], index);
}

static UIPreferredPresentationStyle uiPreferredPresentationStyle(WebPreferredPresentationStyle style)
{
    switch (style) {
    case WebPreferredPresentationStyleUnspecified:
        return UIPreferredPresentationStyleUnspecified;
    case WebPreferredPresentationStyleInline:
        return UIPreferredPresentationStyleInline;
    case WebPreferredPresentationStyleAttachment:
        return UIPreferredPresentationStyleAttachment;
    default:
        ASSERT_NOT_REACHED();
        return UIPreferredPresentationStyleUnspecified;
    }
}

- (UIItemProvider *)itemProvider
{
    if (!self.numberOfItems)
        return nil;

    auto itemProvider = adoptNS([allocUIItemProviderInstance() init]);
    for (WebItemProviderRegistrationInfo *representation in _representations.get()) {
        if (representation.representingObject) {
            [itemProvider registerObject:representation.representingObject visibility:UIItemProviderRepresentationOptionsVisibilityAll];
            continue;
        }

        if (!representation.typeIdentifier.length || !representation.data.length)
            continue;

        RetainPtr<NSData> itemData = representation.data;
        [itemProvider registerDataRepresentationForTypeIdentifier:representation.typeIdentifier visibility:UIItemProviderRepresentationOptionsVisibilityAll loadHandler:[itemData] (ItemProviderDataLoadCompletionHandler completionHandler) -> NSProgress * {
            completionHandler(itemData.get(), nil);
            return nil;
        }];
    }
    [itemProvider setPreferredPresentationSize:self.preferredPresentationSize];
    [itemProvider setSuggestedName:self.suggestedName];
    [itemProvider setPreferredPresentationStyle:uiPreferredPresentationStyle(self.preferredPresentationStyle)];
    [itemProvider setTeamData:self.teamData];
    return itemProvider.autorelease();
}

- (NSString *)description
{
    __block NSMutableString *description = [NSMutableString string];
    [description appendFormat:@"<%@: %p", [self class], self];
    [self enumerateItems:^(WebItemProviderRegistrationInfo *item, NSUInteger index) {
        if (index)
            [description appendString:@","];

        if (item.representingObject)
            [description appendFormat:@" (%@: %p)", [item.representingObject class], item.representingObject];
        else
            [description appendFormat:@" ('%@' => %tu bytes)", item.typeIdentifier, item.data.length];
    }];
    [description appendString:@">"];
    return description;
}

@end

@interface WebItemProviderLoadResult : NSObject

- (instancetype)initWithItemProvider:(NSItemProvider *)itemProvider typesToLoad:(NSArray<NSString *> *)typesToLoad;
- (NSURL *)fileURLForType:(NSString *)type;
- (void)setFileURL:(NSURL *)url forType:(NSString *)type;
@property (nonatomic, readonly) NSArray<NSURL *> *loadedFileURLs;
@property (nonatomic, readonly) NSArray<NSString *> *loadedTypeIdentifiers;
@property (nonatomic, readonly) BOOL canBeRepresentedAsFileUpload;
@property (nonatomic, readonly) NSItemProvider *itemProvider;
@property (nonatomic, readonly) NSArray<NSString *> *typesToLoad;

@end

@implementation WebItemProviderLoadResult {
    RetainPtr<TypeToFileURLMap> _fileURLs;
    RetainPtr<NSItemProvider> _itemProvider;
    RetainPtr<NSArray<NSString *>> _typesToLoad;
}

+ (instancetype)loadResultWithItemProvider:(NSItemProvider *)itemProvider typesToLoad:(NSArray<NSString *> *)typesToLoad
{
    return [[[self alloc] initWithItemProvider:itemProvider typesToLoad:typesToLoad] autorelease];
}

- (instancetype)initWithItemProvider:(NSItemProvider *)itemProvider typesToLoad:(NSArray<NSString *> *)typesToLoad
{
    if (!(self = [super init]))
        return nil;

    _fileURLs = adoptNS([[NSMutableDictionary alloc] init]);
    _itemProvider = itemProvider;
    _typesToLoad = typesToLoad;
    _canBeRepresentedAsFileUpload = itemProvider.preferredPresentationStyle != UIPreferredPresentationStyleInline;

    return self;
}

- (NSArray<NSString *> *)typesToLoad
{
    return _typesToLoad.get();
}

- (NSURL *)fileURLForType:(NSString *)type
{
    return [_fileURLs objectForKey:type];
}

- (void)setFileURL:(NSURL *)url forType:(NSString *)type
{
    [_fileURLs setObject:url forKey:type];
}

- (NSArray<NSURL *> *)loadedFileURLs
{
    return [_fileURLs allValues];
}

- (NSArray<NSString *> *)loadedTypeIdentifiers
{
    return [_fileURLs allKeys];
}

- (NSItemProvider *)itemProvider
{
    return _itemProvider.get();
}

@end

@interface WebItemProviderPasteboard ()

@property (nonatomic) NSInteger numberOfItems;
@property (nonatomic) NSInteger changeCount;
@property (nonatomic) NSInteger pendingOperationCount;

@end

@implementation WebItemProviderPasteboard {
    // FIXME: These ivars should be refactored to be Vector<RetainPtr<Type>> instead of generic NSArrays.
    RetainPtr<NSArray> _itemProviders;
    RetainPtr<NSArray> _supportedTypeIdentifiers;
    RetainPtr<WebItemProviderRegistrationInfoList> _stagedRegistrationInfoList;

    Vector<RetainPtr<WebItemProviderLoadResult>> _loadResults;
}

+ (instancetype)sharedInstance
{
    static WebItemProviderPasteboard *sharedPasteboard = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^() {
        sharedPasteboard = [[WebItemProviderPasteboard alloc] init];
    });
    return sharedPasteboard;
}

- (instancetype)init
{
    if (self = [super init]) {
        _itemProviders = adoptNS([[NSArray alloc] init]);
        _changeCount = 0;
        _pendingOperationCount = 0;
        _supportedTypeIdentifiers = nil;
        _stagedRegistrationInfoList = nil;
        _loadResults = { };
    }
    return self;
}

- (void)updateSupportedTypeIdentifiers:(NSArray<NSString *> *)types
{
    _supportedTypeIdentifiers = types;
}

- (NSArray<NSString *> *)pasteboardTypesByFidelityForItemAtIndex:(NSUInteger)index
{
    return [self itemProviderAtIndex:index].registeredTypeIdentifiers ?: @[ ];
}

- (NSArray<NSString *> *)pasteboardTypes
{
    NSMutableSet<NSString *> *allTypes = [NSMutableSet set];
    NSMutableArray<NSString *> *allTypesInOrder = [NSMutableArray array];
    for (UIItemProvider *provider in _itemProviders.get()) {
        for (NSString *typeIdentifier in provider.registeredTypeIdentifiers) {
            if ([allTypes containsObject:typeIdentifier])
                continue;

            [allTypes addObject:typeIdentifier];
            [allTypesInOrder addObject:typeIdentifier];
        }
    }
    return allTypesInOrder;
}

- (NSArray<__kindof NSItemProvider *> *)itemProviders
{
    return _itemProviders.get();
}

- (void)setItemProviders:(NSArray<__kindof NSItemProvider *> *)itemProviders
{
    itemProviders = itemProviders ?: [NSArray array];
    if (_itemProviders == itemProviders || [_itemProviders isEqualToArray:itemProviders])
        return;

    _itemProviders = itemProviders;
    _changeCount++;

    if (!itemProviders.count)
        _loadResults = { };
}

- (NSInteger)numberOfItems
{
    return [_itemProviders count];
}

- (NSData *)_preLoadedDataConformingToType:(NSString *)typeIdentifier forItemProviderAtIndex:(NSUInteger)index
{
    if (_loadResults.size() != [_itemProviders count]) {
        ASSERT_NOT_REACHED();
        return nil;
    }

    WebItemProviderLoadResult *loadResult = _loadResults[index].get();
    for (NSString *loadedType in loadResult.loadedTypeIdentifiers) {
        if (!UTTypeConformsTo((CFStringRef)loadedType, (CFStringRef)typeIdentifier))
            continue;

        // We've already loaded data relevant for this UTI type onto disk, so there's no need to ask the UIItemProvider for the same data again.
        if (NSData *result = [NSData dataWithContentsOfURL:[loadResult fileURLForType:loadedType] options:NSDataReadingMappedIfSafe error:nil])
            return result;
    }
    return nil;
}

- (NSData *)dataForPasteboardType:(NSString *)pasteboardType
{
    return [self dataForPasteboardType:pasteboardType inItemSet:[NSIndexSet indexSetWithIndexesInRange:NSMakeRange(0, self.numberOfItems)]].firstObject;
}

- (NSArray *)dataForPasteboardType:(NSString *)pasteboardType inItemSet:(NSIndexSet *)itemSet
{
    if (_loadResults.isEmpty())
        return @[ ];

    auto values = adoptNS([[NSMutableArray alloc] init]);
    RetainPtr<WebItemProviderPasteboard> retainedSelf = self;
    [itemSet enumerateIndexesUsingBlock:[retainedSelf, pasteboardType, values] (NSUInteger index, BOOL *) {
        UIItemProvider *provider = [retainedSelf itemProviderAtIndex:index];
        if (!provider)
            return;

        if (NSData *loadedData = [retainedSelf _preLoadedDataConformingToType:pasteboardType forItemProviderAtIndex:index])
            [values addObject:loadedData];
    }];
    return values.autorelease();
}

static NSArray<Class<UIItemProviderReading>> *allLoadableClasses()
{
    return @[ [getUIColorClass() class], [getUIImageClass() class], [NSURL class], [NSString class], [NSAttributedString class] ];
}

static Class classForTypeIdentifier(NSString *typeIdentifier, NSString *&outTypeIdentifierToLoad)
{
    outTypeIdentifierToLoad = typeIdentifier;

    // First, try to load a platform UIItemProviderReading-conformant object as-is.
    for (Class<UIItemProviderReading> loadableClass in allLoadableClasses()) {
        if ([[loadableClass readableTypeIdentifiersForItemProvider] containsObject:(NSString *)typeIdentifier])
            return loadableClass;
    }

    // If we were unable to load any object, check if the given type identifier is still something
    // WebKit knows how to handle.
    if ([typeIdentifier isEqualToString:(NSString *)kUTTypeHTML]) {
        // Load kUTTypeHTML as a plain text HTML string.
        outTypeIdentifierToLoad = (NSString *)kUTTypePlainText;
        return [NSString class];
    }

    return nil;
}

- (NSArray *)valuesForPasteboardType:(NSString *)pasteboardType inItemSet:(NSIndexSet *)itemSet
{
    if (_loadResults.isEmpty())
        return @[ ];

    auto values = adoptNS([[NSMutableArray alloc] init]);
    RetainPtr<WebItemProviderPasteboard> retainedSelf = self;
    [itemSet enumerateIndexesUsingBlock:[retainedSelf, pasteboardType, values] (NSUInteger index, BOOL *) {
        UIItemProvider *provider = [retainedSelf itemProviderAtIndex:index];
        if (!provider)
            return;

        NSString *typeIdentifierToLoad;
        Class readableClass = classForTypeIdentifier(pasteboardType, typeIdentifierToLoad);
        if (!readableClass)
            return;

        NSData *preloadedData = [retainedSelf _preLoadedDataConformingToType:pasteboardType forItemProviderAtIndex:index];
        if (!preloadedData)
            return;

        if (id <NSItemProviderReading> readObject = [readableClass objectWithItemProviderData:preloadedData typeIdentifier:(NSString *)typeIdentifierToLoad error:nil])
            [values addObject:readObject];
    }];

    return values.autorelease();
}

- (NSInteger)changeCount
{
    return _changeCount;
}

- (NSArray<NSURL *> *)droppedFileURLs
{
    NSMutableArray<NSURL *> *fileURLs = [NSMutableArray array];
    for (auto loadResult : _loadResults) {
        if ([loadResult canBeRepresentedAsFileUpload])
            [fileURLs addObjectsFromArray:[loadResult loadedFileURLs]];
    }
    return fileURLs;
}

static BOOL typeConformsToTypes(NSString *type, NSArray *conformsToTypes)
{
    // A type is considered appropriate to load if it conforms to one or more supported types.
    for (NSString *conformsToType in conformsToTypes) {
        if (UTTypeConformsTo((CFStringRef)type, (CFStringRef)conformsToType))
            return YES;
    }
    return NO;
}

- (NSInteger)numberOfFiles
{
    NSArray *supportedFileTypes = Pasteboard::supportedFileUploadPasteboardTypes();
    NSInteger numberOfFiles = 0;
    for (UIItemProvider *itemProvider in _itemProviders.get()) {
        if (itemProvider.preferredPresentationStyle == UIPreferredPresentationStyleInline)
            continue;

        for (NSString *identifier in itemProvider.registeredTypeIdentifiers) {
            if (!typeConformsToTypes(identifier, supportedFileTypes))
                continue;
            ++numberOfFiles;
            break;
        }
    }
    return numberOfFiles;
}

static NSURL *linkTemporaryItemProviderFilesToDropStagingDirectory(NSURL *url, NSString *suggestedName, NSString *typeIdentifier)
{
    static NSString *defaultDropFolderName = @"folder";
    static NSString *defaultDropFileName = @"file";
    static NSString *dataInteractionDirectoryPrefix = @"data-interaction";
    if (!url)
        return nil;

    NSString *temporaryDataInteractionDirectory = WebCore::createTemporaryDirectory(dataInteractionDirectoryPrefix);
    if (!temporaryDataInteractionDirectory)
        return nil;

    NSURL *destination = nil;
    BOOL isFolder = UTTypeConformsTo((CFStringRef)typeIdentifier, kUTTypeFolder);
    NSFileManager *fileManager = [NSFileManager defaultManager];

    if (!suggestedName)
        suggestedName = url.lastPathComponent ?: (isFolder ? defaultDropFolderName : defaultDropFileName);

    if (![suggestedName containsString:@"."] && !isFolder)
        suggestedName = [suggestedName stringByAppendingPathExtension:url.pathExtension];

    destination = [NSURL fileURLWithPath:[temporaryDataInteractionDirectory stringByAppendingPathComponent:suggestedName]];
    return [fileManager linkItemAtURL:url toURL:destination error:nil] ? destination : nil;
}

- (NSArray<NSString *> *)typeIdentifiersToLoadForRegisteredTypeIdentfiers:(NSArray<NSString *> *)registeredTypeIdentifiers
{
    NSMutableSet *typesToLoad = [NSMutableSet set];
    NSString *highestFidelityContentType = nil;

    // First, we want to either load the highest fidelity supported type or the highest fidelity generic content type.
    for (NSString *registeredTypeIdentifier in registeredTypeIdentifiers) {
        if (typeConformsToTypes(registeredTypeIdentifier, _supportedTypeIdentifiers.get())) {
            [typesToLoad addObject:registeredTypeIdentifier];
            break;
        }

        if (!highestFidelityContentType && UTTypeConformsTo((CFStringRef)registeredTypeIdentifier, kUTTypeContent))
            highestFidelityContentType = registeredTypeIdentifier;
    }
    if (!typesToLoad.count && highestFidelityContentType)
        [typesToLoad addObject:highestFidelityContentType];

    // For compatibility with DataTransfer APIs, additionally load web-exposed types. Since this is the only chance to
    // fault in any data at all, we need to load up front any information that the page may ask for later down the line.
    NSString *customPasteboardDataUTI = @(PasteboardCustomData::cocoaType());
    for (NSString *registeredTypeIdentifier in registeredTypeIdentifiers) {
        if ([typesToLoad containsObject:registeredTypeIdentifier])
            continue;
        if ([registeredTypeIdentifier isEqualToString:customPasteboardDataUTI])
            [typesToLoad addObject:customPasteboardDataUTI];
        if (UTTypeConformsTo((CFStringRef)registeredTypeIdentifier, kUTTypeURL))
            [typesToLoad addObject:(NSString *)kUTTypeURL];
        if (UTTypeConformsTo((CFStringRef)registeredTypeIdentifier, kUTTypeHTML))
            [typesToLoad addObject:(NSString *)kUTTypeHTML];
        if (UTTypeConformsTo((CFStringRef)registeredTypeIdentifier, kUTTypePlainText))
            [typesToLoad addObject:(NSString *)kUTTypePlainText];
    }

    return typesToLoad.allObjects;
}

- (void)doAfterLoadingProvidedContentIntoFileURLs:(WebItemProviderFileLoadBlock)action
{
    [self doAfterLoadingProvidedContentIntoFileURLs:action synchronousTimeout:0];
}

- (void)doAfterLoadingProvidedContentIntoFileURLs:(WebItemProviderFileLoadBlock)action synchronousTimeout:(NSTimeInterval)synchronousTimeout
{
    _loadResults.clear();

    auto changeCountBeforeLoading = _changeCount;
    auto loadResults = adoptNS([[NSMutableArray alloc] initWithCapacity:[_itemProviders count]]);

    // First, figure out which item providers we want to try and load files from.
    BOOL foundAnyDataToLoad = NO;
    RetainPtr<WebItemProviderPasteboard> protectedSelf = self;
    for (NSItemProvider *itemProvider in _itemProviders.get()) {
        NSArray<NSString *> *typeIdentifiersToLoad = [protectedSelf typeIdentifiersToLoadForRegisteredTypeIdentfiers:itemProvider.registeredTypeIdentifiers];
        foundAnyDataToLoad |= typeIdentifiersToLoad.count;
        [loadResults addObject:[WebItemProviderLoadResult loadResultWithItemProvider:itemProvider typesToLoad:typeIdentifiersToLoad]];
    }

    if (!foundAnyDataToLoad) {
        action(@[ ]);
        return;
    }

    auto setFileURLsLock = adoptNS([[NSLock alloc] init]);
    auto synchronousFileLoadingGroup = adoptOSObject(dispatch_group_create());
    auto fileLoadingGroup = adoptOSObject(dispatch_group_create());
    for (WebItemProviderLoadResult *loadResult in loadResults.get()) {
        for (NSString *typeToLoad in loadResult.typesToLoad) {
            dispatch_group_enter(fileLoadingGroup.get());
            dispatch_group_enter(synchronousFileLoadingGroup.get());
            [loadResult.itemProvider loadFileRepresentationForTypeIdentifier:typeToLoad completionHandler:[protectedLoadResult = retainPtr(loadResult), synchronousFileLoadingGroup, setFileURLsLock, protectedTypeToLoad = retainPtr(typeToLoad), fileLoadingGroup] (NSURL *url, NSError *) {
                // After executing this completion block, UIKit removes the file at the given URL. However, we need this data to persist longer for the web content process.
                // To address this, we hard link the given URL to a new temporary file in the temporary directory. This follows the same flow as regular file upload, in
                // WKFileUploadPanel.mm. The temporary files are cleaned up by the system at a later time.
                if (NSURL *destination = linkTemporaryItemProviderFilesToDropStagingDirectory(url, [protectedLoadResult itemProvider].suggestedName, protectedTypeToLoad.get())) {
                    [setFileURLsLock lock];
                    [protectedLoadResult setFileURL:destination forType:protectedTypeToLoad.get()];
                    [setFileURLsLock unlock];
                }
                dispatch_group_leave(fileLoadingGroup.get());
                dispatch_group_leave(synchronousFileLoadingGroup.get());
            }];
        }
    }

    RetainPtr<WebItemProviderPasteboard> retainedSelf = self;
    auto itemLoadCompletion = [retainedSelf, synchronousFileLoadingGroup, fileLoadingGroup, loadResults, completionBlock = makeBlockPtr(action), changeCountBeforeLoading] {
        if (changeCountBeforeLoading == retainedSelf->_changeCount) {
            for (WebItemProviderLoadResult *loadResult in loadResults.get())
                retainedSelf->_loadResults.append(loadResult);
        }

        completionBlock([retainedSelf droppedFileURLs]);
    };

    if (synchronousTimeout > 0 && !dispatch_group_wait(synchronousFileLoadingGroup.get(), dispatch_time(DISPATCH_TIME_NOW, synchronousTimeout * NSEC_PER_SEC))) {
        itemLoadCompletion();
        return;
    }

    dispatch_group_notify(fileLoadingGroup.get(), dispatch_get_main_queue(), itemLoadCompletion);
}

- (UIItemProvider *)itemProviderAtIndex:(NSUInteger)index
{
    return index < [_itemProviders count] ? [_itemProviders objectAtIndex:index] : nil;
}

- (BOOL)hasPendingOperation
{
    return _pendingOperationCount;
}

- (void)incrementPendingOperationCount
{
    _pendingOperationCount++;
}

- (void)decrementPendingOperationCount
{
    _pendingOperationCount--;
}

- (void)enumerateItemProvidersWithBlock:(void (^)(UIItemProvider *itemProvider, NSUInteger index, BOOL *stop))block
{
    [_itemProviders enumerateObjectsUsingBlock:block];
}

- (void)stageRegistrationList:(nullable WebItemProviderRegistrationInfoList *)info
{
    _stagedRegistrationInfoList = info.numberOfItems ? info : nil;
}

- (WebItemProviderRegistrationInfoList *)takeRegistrationList
{
    auto stagedRegistrationInfoList = _stagedRegistrationInfoList;
    _stagedRegistrationInfoList = nil;
    return stagedRegistrationInfoList.autorelease();
}

@end

#endif // ENABLE(DATA_INTERACTION)
