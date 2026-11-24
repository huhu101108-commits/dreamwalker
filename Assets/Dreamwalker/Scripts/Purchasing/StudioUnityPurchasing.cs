using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Purchasing;
using UnityEngine.Purchasing.Extension;

namespace Dreamwalker.Demo
{
// Unity IAP for the studio's paid products: every shop product priced in won is a consumable with its store product
// ID (sku) on Google Play and the App Store. A purchase stays pending until the game has kept what it gives (on the
// server for server-wallet games, StudioShopServer.cs), so one interrupted on the way is delivered again at the next
// launch. The editor uses IAP's fake store, whose purchases count as test purchases.
public sealed class StudioUnityPurchasing : IDetailedStoreListener
{
    private static StudioUnityPurchasing instance;
    private IStoreController controller;
    private readonly Dictionary<string, Action<StudioReceipt>> waiting = new Dictionary<string, Action<StudioReceipt>>();

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Register() => StudioPurchases.Prepare = Start;

    private static void Start(StudioProject project)
    {
        if (instance != null) return;
        var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
        int products = 0;
        foreach (var p in project.shop?.products ?? Array.Empty<StudioProduct>())
            if (p.cost?.kind == "money" && !string.IsNullOrEmpty(p.cost.sku)) { builder.AddProduct(p.cost.sku, ProductType.Consumable); products++; }
        if (products == 0) return;
        instance = new StudioUnityPurchasing();
        UnityPurchasing.Initialize(instance, builder);
    }
    private static string Store() =>
        Application.isEditor ? "test" :
        Application.platform == RuntimePlatform.IPhonePlayer || Application.platform == RuntimePlatform.OSXPlayer ? "apple" : "google";

    public void OnInitialized(IStoreController storeController, IExtensionProvider extensions)
    {
        controller = storeController;
        StudioPurchases.ReceiptHandler = Buy;
        StudioPurchases.Confirm = Confirm;
    }
    private void Buy(string sku, int priceWon, Action<StudioReceipt> done)
    {
        var product = controller?.products.WithID(sku);
        if (product == null || !product.availableToPurchase) { done(new StudioReceipt { sku = sku }); return; }
        waiting[sku] = done;
        controller.InitiatePurchase(product);
    }
    private void Confirm(StudioReceipt receipt)
    {
        var product = controller?.products.WithID(receipt.sku);
        if (product != null) controller.ConfirmPendingPurchase(product);
    }
    public PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs args)
    {
        var product = args.purchasedProduct;
        // Google Play reports the purchase token as the transaction ID; the App Store its transaction identifier.
        var receipt = new StudioReceipt { ok = true, store = Store(), sku = product.definition.id, token = product.transactionID };
        if (waiting.TryGetValue(receipt.sku, out var done)) { waiting.Remove(receipt.sku); done(receipt); }
        else StudioPurchases.Pending?.Invoke(receipt);
        return PurchaseProcessingResult.Pending;
    }
    public void OnPurchaseFailed(Product product, PurchaseFailureDescription failureDescription) => Fail(product);
    public void OnPurchaseFailed(Product product, PurchaseFailureReason failureReason) => Fail(product);
    private void Fail(Product product)
    {
        string sku = product?.definition.id;
        if (sku != null && waiting.TryGetValue(sku, out var done)) { waiting.Remove(sku); done(new StudioReceipt { sku = sku }); }
    }
    public void OnInitializeFailed(InitializationFailureReason error) => Debug.LogWarning("Unity IAP could not start: " + error);
    public void OnInitializeFailed(InitializationFailureReason error, string message) => Debug.LogWarning("Unity IAP could not start: " + error + " " + message);
}
}
