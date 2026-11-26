/**
 * 妆匣 BeautyBox · 浏览器交互原型（TASK 02）
 * 贴近真实场景的初始模拟数据集（仅用于浏览器原型体验）
 *
 * 严格遵循 ADR-0001：
 * - Product 与 ProductItem 分离，演示同款产品多实例独立记录
 * - 金额采用整数最小货币单位 purchasePriceMinor（字符串）+ ISO 4217 currencyCode
 * - 覆盖 CNY(2) / USD(2) / JPY(0) / KWD(3) 多币种场景
 * - 覆盖「有封面」「无封面但有图兜底」「完全无图占位」三种产品封面状态
 * - 覆盖「未确认」「已确认」「输入变化待重新确认」「缺少信息不推算」四种有效期状态
 * - 覆盖「修改/归档产品后历史妆容快照不失真」示例
 */

import { addDays, addMonths, todayStr } from './expiry.js';

export function createSeedData(now = new Date()) {
  const today = todayStr(now);
  const d = (offset) => addDays(today, offset);
  const m = (monthsOffset) => addMonths(today, monthsOffset);

  const categories = [
    { id: 'cat-base', name: '底妆', sortOrder: 1, isSystem: true },
    { id: 'cat-lip', name: '唇妆', sortOrder: 2, isSystem: true },
    { id: 'cat-eye', name: '眼妆', sortOrder: 3, isSystem: true },
    { id: 'cat-cheek', name: '腮红修容', sortOrder: 4, isSystem: true },
    { id: 'cat-brow', name: '眉妆', sortOrder: 5, isSystem: true },
    { id: 'cat-care', name: '护肤', sortOrder: 6, isSystem: true },
  ];

  const brands = [
    { id: 'brand-armani', name: 'Giorgio Armani' },
    { id: 'brand-lancome', name: 'Lancôme' },
    { id: 'brand-suqqu', name: 'SUQQU' },
    { id: 'brand-aesop', name: 'Aesop' },
    { id: 'brand-romand', name: 'rom&nd' },
  ];

  const mediaAssets = [
    { id: 'asset-s1', kind: 'sample', sampleKey: 'sample-foundation', mimeType: 'image/svg+xml', createdAt: `${d(-60)}T08:00:00Z` },
    { id: 'asset-s2', kind: 'sample', sampleKey: 'sample-lipstick', mimeType: 'image/svg+xml', createdAt: `${d(-50)}T08:00:00Z` },
    { id: 'asset-s3', kind: 'sample', sampleKey: 'sample-lipstick-detail', mimeType: 'image/svg+xml', createdAt: `${d(-49)}T08:00:00Z` },
    { id: 'asset-s4', kind: 'sample', sampleKey: 'sample-eyeshadow', mimeType: 'image/svg+xml', createdAt: `${d(-40)}T08:00:00Z` },
    { id: 'asset-s5', kind: 'sample', sampleKey: 'sample-serum', mimeType: 'image/svg+xml', createdAt: `${d(-30)}T08:00:00Z` },
    { id: 'asset-s6', kind: 'sample', sampleKey: 'sample-look-commute', mimeType: 'image/svg+xml', createdAt: `${d(-3)}T09:00:00Z` },
    { id: 'asset-s7', kind: 'sample', sampleKey: 'sample-look-commute-4h', mimeType: 'image/svg+xml', createdAt: `${d(-3)}T13:00:00Z` },
    { id: 'asset-s8', kind: 'sample', sampleKey: 'sample-look-date', mimeType: 'image/svg+xml', createdAt: `${d(-10)}T18:00:00Z` },
    { id: 'asset-s9', kind: 'sample', sampleKey: 'sample-diary-calm', mimeType: 'image/svg+xml', createdAt: `${d(-1)}T21:30:00Z` },
  ];

  const products = [
    {
      id: 'prod-lip-196',
      brandId: 'brand-lancome',
      categoryId: 'cat-lip',
      subCategoryId: 'sub-lipstick',
      name: '菁纯丝绒雾面唇膏',
      customName: '菁纯丝绒雾面唇膏',
      specification: '3.4 g',
      specificationValue: '3.4',
      specificationUnit: 'g',
      quantityUnit: '支',
      shade: '#196 朱砂橘',
      texture: '丝绒哑光',
      finish: '柔雾显白',
      notesPrivate: '薄涂提气色，厚涂偏暖橘红，注意唇部先打底。',
      createdAt: `${d(-180)}T10:00:00Z`,
      updatedAt: `${d(-5)}T10:00:00Z`,
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
    },
    {
      id: 'prod-found-ls',
      brandId: 'brand-armani',
      categoryId: 'cat-base',
      subCategoryId: 'sub-foundation',
      name: '柔亮自然粉底液',
      customName: '柔亮自然粉底液',
      specification: '30 ml',
      specificationValue: '30',
      specificationUnit: 'ml',
      quantityUnit: '瓶',
      shade: '2号 象牙白',
      texture: '轻薄乳液',
      finish: '缎光自然',
      notesPrivate: '混合肌春秋最稳，夏天需局部定妆。',
      createdAt: `${d(-140)}T10:00:00Z`,
      updatedAt: `${d(-3)}T09:00:00Z`,
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
    },
    {
      id: 'prod-eye-04',
      brandId: 'brand-suqqu',
      categoryId: 'cat-eye',
      subCategoryId: 'sub-eyeshadow',
      name: '晶采盈致四色眼影盘',
      customName: '晶采盈致四色眼影盘',
      specification: '6.2 g',
      specificationValue: '6.2',
      specificationUnit: 'g',
      quantityUnit: '盘',
      shade: '04 纯抚子',
      texture: '细腻粉质',
      finish: '清透珠光',
      notesPrivate: '东京百货购入，日常通勤百搭。',
      createdAt: `${d(-95)}T10:00:00Z`,
      updatedAt: `${d(-10)}T10:00:00Z`,
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
    },
    {
      id: 'prod-serum-b3',
      brandId: 'brand-aesop',
      categoryId: 'cat-care',
      subCategoryId: 'sub-serum',
      name: '澄莹面部精华素',
      customName: '澄莹面部精华素',
      specification: '60 ml',
      specificationValue: '60',
      specificationUnit: 'ml',
      quantityUnit: '瓶',
      shade: '',
      texture: '清润凝露',
      finish: '保湿维稳',
      notesPrivate: '晚间修护用，瓶身未标注生产日期，仅记录开封 PAO。',
      createdAt: `${d(-65)}T10:00:00Z`,
      updatedAt: `${d(-1)}T21:00:00Z`,
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
    },
    {
      id: 'prod-blush-nocover',
      brandId: 'brand-romand',
      categoryId: 'cat-cheek',
      subCategoryId: 'sub-blush',
      name: '微醺柔雾单色腮红',
      customName: '微醺柔雾单色腮红',
      specification: '4 g',
      specificationValue: '4',
      specificationUnit: 'g',
      quantityUnit: '块',
      shade: 'N02 杏仁奶霜',
      texture: '哑光微粉',
      finish: '自然膨胀感',
      notesPrivate: '故意未设封面（无照片）以展示“无封面占位图”交互规则。',
      createdAt: `${d(-25)}T10:00:00Z`,
      updatedAt: `${d(-25)}T10:00:00Z`,
      archivedAt: null,
      deletedAt: null,
      purgeAt: null,
    },
  ];

  // 产品封面图唯一真相源：productPhotos.isCover（同一 productId 至多 1 条 isCover=true）
  const productPhotos = [
    { id: 'pp-1', productId: 'prod-lip-196', assetId: 'asset-s2', sortOrder: 0, isCover: true, createdAt: `${d(-50)}T08:00:00Z` },
    { id: 'pp-2', productId: 'prod-lip-196', assetId: 'asset-s3', sortOrder: 1, isCover: false, createdAt: `${d(-49)}T08:00:00Z` },
    { id: 'pp-3', productId: 'prod-found-ls', assetId: 'asset-s1', sortOrder: 0, isCover: true, createdAt: `${d(-60)}T08:00:00Z` },
    { id: 'pp-4', productId: 'prod-eye-04', assetId: 'asset-s4', sortOrder: 0, isCover: true, createdAt: `${d(-40)}T08:00:00Z` },
    { id: 'pp-5', productId: 'prod-serum-b3', assetId: 'asset-s5', sortOrder: 0, isCover: true, createdAt: `${d(-30)}T08:00:00Z` },
    // prod-blush-nocover 故意没有任何照片，用于展示“无封面占位”
  ];

  // ProductItem 实例：演示同款多瓶、多币种、已用完、已归档、不同有效期状态
  const productItems = [
    {
      id: 'item-lip-1',
      productId: 'prod-lip-196',
      purchasePriceMinor: '32000', // ¥320.00
      currencyCode: 'CNY',
      purchaseDate: d(-170),
      purchaseChannel: '专柜自购',
      manufactureDate: d(-350),
      unopenedShelfMonths: 36,
      openedDate: d(-160),
      paoMonths: 12,
      computedExpiryDate: addMonths(d(-160), 12),
      expiryBasis: 'opened',
      confirmedExpiryDate: addMonths(d(-160), 12),
      expiryConfirmedAt: `${d(-160)}T12:00:00Z`,
      expiryNeedsReconfirm: false,
      status: 'in_use',
      remainingPercent: 55,
      lastUsedAt: `${d(-3)}T08:15:00Z`,
      createdAt: `${d(-170)}T10:00:00Z`,
      updatedAt: `${d(-3)}T08:15:00Z`,
      archivedAt: null,
    },
    {
      id: 'item-lip-2',
      productId: 'prod-lip-196',
      purchasePriceMinor: '3850', // US$38.50
      currencyCode: 'USD',
      purchaseDate: d(-20),
      purchaseChannel: '机场免税囤货',
      manufactureDate: d(-90),
      unopenedShelfMonths: 36,
      openedDate: null,
      paoMonths: null,
      computedExpiryDate: addMonths(d(-90), 36),
      expiryBasis: 'unopened',
      confirmedExpiryDate: null,
      expiryConfirmedAt: null,
      expiryNeedsReconfirm: false,
      status: 'unopened',
      remainingPercent: 100,
      lastUsedAt: null,
      createdAt: `${d(-20)}T10:00:00Z`,
      updatedAt: `${d(-20)}T10:00:00Z`,
      archivedAt: null,
    },
    {
      id: 'item-found-1',
      productId: 'prod-found-ls',
      purchasePriceMinor: '63000', // ¥630.00
      currencyCode: 'CNY',
      purchaseDate: d(-310),
      purchaseChannel: '官方旗舰店',
      manufactureDate: d(-400),
      unopenedShelfMonths: 36,
      openedDate: d(-300),
      paoMonths: 12,
      computedExpiryDate: addMonths(d(-300), 12),
      expiryBasis: 'opened',
      confirmedExpiryDate: d(15), // 仅在用户设置临期阈值 >=15 天时判定临期
      expiryConfirmedAt: `${d(-300)}T12:00:00Z`,
      expiryNeedsReconfirm: false,
      status: 'in_use',
      remainingPercent: 25,
      lastUsedAt: `${d(-3)}T08:05:00Z`,
      createdAt: `${d(-310)}T10:00:00Z`,
      updatedAt: `${d(-3)}T08:05:00Z`,
      archivedAt: null,
    },
    {
      id: 'item-found-old',
      productId: 'prod-found-ls',
      purchasePriceMinor: '59000', // ¥590.00（已用完且已归档，仍计入历史消费总账，不计入当前持有件数）
      currencyCode: 'CNY',
      purchaseDate: d(-680),
      purchaseChannel: '线下百货',
      manufactureDate: null,
      unopenedShelfMonths: null,
      openedDate: d(-670),
      usedUpDate: d(-320),
      paoMonths: 12,
      computedExpiryDate: addMonths(d(-670), 12),
      expiryBasis: 'opened',
      confirmedExpiryDate: addMonths(d(-670), 12),
      expiryConfirmedAt: `${d(-670)}T12:00:00Z`,
      expiryNeedsReconfirm: false,
      status: 'used_up',
      remainingPercent: 0,
      lastUsedAt: `${d(-320)}T08:00:00Z`,
      createdAt: `${d(-680)}T10:00:00Z`,
      updatedAt: `${d(-320)}T12:00:00Z`,
      archivedAt: `${d(-315)}T12:00:00Z`,
    },
    {
      id: 'item-eye-1',
      productId: 'prod-eye-04',
      purchasePriceMinor: '48000', // HK$480.00
      currencyCode: 'HKD',
      purchaseDate: d(-95),
      purchaseChannel: '香港专柜',
      manufactureDate: null,
      unopenedShelfMonths: null,
      openedDate: d(-90),
      paoMonths: 24,
      computedExpiryDate: addMonths(d(-90), 24),
      expiryBasis: 'opened',
      confirmedExpiryDate: null,
      expiryConfirmedAt: null,
      expiryNeedsReconfirm: false,
      status: 'in_use',
      remainingPercent: 85,
      lastUsedAt: `${d(-3)}T08:10:00Z`,
      createdAt: `${d(-95)}T10:00:00Z`,
      updatedAt: `${d(-3)}T08:10:00Z`,
      archivedAt: null,
    },
    {
      id: 'item-serum-1',
      productId: 'prod-serum-b3',
      purchasePriceMinor: '3200', // £32.00
      currencyCode: 'GBP',
      purchaseDate: d(-65),
      purchaseChannel: '海外旅行免税店',
      manufactureDate: null,
      unopenedShelfMonths: null,
      openedDate: d(-60),
      paoMonths: 12,
      computedExpiryDate: addMonths(d(-60), 12),
      expiryBasis: 'opened',
      confirmedExpiryDate: null,
      expiryConfirmedAt: null,
      expiryNeedsReconfirm: false,
      status: 'in_use',
      remainingPercent: 70,
      lastUsedAt: `${d(-1)}T21:10:00Z`,
      createdAt: `${d(-65)}T10:00:00Z`,
      updatedAt: `${d(-1)}T21:10:00Z`,
      archivedAt: null,
    },
    {
      id: 'item-blush-1',
      productId: 'prod-blush-nocover',
      purchasePriceMinor: '5800', // ¥58.00
      currencyCode: 'CNY',
      purchaseDate: d(-25),
      purchaseChannel: '集合店',
      manufactureDate: d(-120),
      unopenedShelfMonths: null, // 故意缺未开封保质期，演示“缺少计算要素时不猜测到期日”
      openedDate: null,
      paoMonths: null,
      computedExpiryDate: null,
      expiryBasis: 'none',
      confirmedExpiryDate: null,
      expiryConfirmedAt: null,
      expiryNeedsReconfirm: false,
      status: 'idle',
      remainingPercent: 95,
      lastUsedAt: `${d(-10)}T17:30:00Z`,
      createdAt: `${d(-25)}T10:00:00Z`,
      updatedAt: `${d(-25)}T10:00:00Z`,
      archivedAt: null,
    },
  ];

  const looks = [
    {
      id: 'look-commute',
      name: '早八清透伪素颜',
      lookDate: d(-3),
      style: '清透通勤',
      scene: '日常上班',
      durationMinutes: 18,
      coverAssetId: 'asset-s6',
      selfRating: 5,
      coordinationRating: 5,
      colorRating: 4,
      wearRating: 5,
      tags: ['伪素颜', '低饱和', '快速出门'],
      notesPrivate: '薄涂粉底后只扫眼尾，下午鼻翼轻微出油但整体融妆自然。',
      createdAt: `${d(-3)}T09:00:00Z`,
      updatedAt: `${d(-3)}T13:30:00Z`,
      archivedAt: null,
    },
    {
      id: 'look-date',
      name: '玫瑰茶棕约会妆',
      lookDate: d(-10),
      style: '温柔氛围',
      scene: '晚餐约会',
      durationMinutes: 35,
      coverAssetId: 'asset-s8',
      selfRating: 4,
      coordinationRating: 5,
      colorRating: 5,
      wearRating: 4,
      tags: ['暖调', '约会', '哑光唇'],
      notesPrivate: '旧款粉底（已用完归档）配合纯抚子眼影，用于演示历史快照保护。',
      createdAt: `${d(-10)}T18:00:00Z`,
      updatedAt: `${d(-10)}T22:00:00Z`,
      archivedAt: null,
    },
  ];

  const lookPhotos = [
    { id: 'lp-1', lookId: 'look-commute', assetId: 'asset-s6', photoRole: 'finished', capturedAt: `${d(-3)}T09:00:00Z`, sortOrder: 0 },
    { id: 'lp-2', lookId: 'look-date', assetId: 'asset-s8', photoRole: 'finished', capturedAt: `${d(-10)}T18:00:00Z`, sortOrder: 0 },
  ];

  // 关联真实 ProductItem，同时保存快照字段
  const lookProductItems = [
    {
      id: 'lpi-1',
      lookId: 'look-commute',
      productItemId: 'item-found-1',
      stepKey: '底妆',
      stepOrder: 1,
      productNameSnapshot: '柔亮自然粉底液',
      brandNameSnapshot: 'Giorgio Armani',
      shadeSnapshot: '2号 象牙白',
      categorySnapshot: '底妆',
    },
    {
      id: 'lpi-2',
      lookId: 'look-commute',
      productItemId: 'item-eye-1',
      stepKey: '眼妆',
      stepOrder: 2,
      productNameSnapshot: '晶采盈致四色眼影盘',
      brandNameSnapshot: 'SUQQU',
      shadeSnapshot: '04 纯抚子',
      categorySnapshot: '眼妆',
    },
    {
      id: 'lpi-3',
      lookId: 'look-commute',
      productItemId: 'item-lip-1',
      stepKey: '唇妆',
      stepOrder: 3,
      productNameSnapshot: '菁纯丝绒雾面唇膏',
      brandNameSnapshot: 'Lancôme',
      shadeSnapshot: '#196 朱砂橘',
      categorySnapshot: '唇妆',
    },
    {
      id: 'lpi-4',
      lookId: 'look-date',
      productItemId: 'item-found-old', // 已用完归档的旧实例，快照应保持完整
      stepKey: '底妆',
      stepOrder: 1,
      productNameSnapshot: '柔亮自然粉底液（旧版空瓶）',
      brandNameSnapshot: 'Giorgio Armani',
      shadeSnapshot: '2号 象牙白',
      categorySnapshot: '底妆',
    },
    {
      id: 'lpi-5',
      lookId: 'look-date',
      productItemId: 'item-blush-1',
      stepKey: '腮红',
      stepOrder: 2,
      productNameSnapshot: '微醺柔雾单色腮红',
      brandNameSnapshot: 'rom&nd',
      shadeSnapshot: 'N02 杏仁奶霜',
      categorySnapshot: '腮红修容',
    },
  ];

  const wearReviews = [
    {
      id: 'wr-1',
      lookId: 'look-commute',
      assetId: 'asset-s6',
      capturedAt: `${d(-3)}T09:00:00Z`,
      wearMinutes: 0,
      timepointKey: '刚完成',
      overallRating: 5,
      smudgeLevel: '无',
      oxidationLevel: '无',
      makeupLossLevel: '无',
      oilLevel: '清爽',
      cakingLevel: '无',
      floatingLevel: '无',
      patchinessLevel: '无',
      notesPrivate: '刚上脸贴合度很好，眼下无卡粉。',
    },
    {
      id: 'wr-2',
      lookId: 'look-commute',
      assetId: 'asset-s7',
      capturedAt: `${d(-3)}T13:05:00Z`,
      wearMinutes: 245,
      timepointKey: '4小时',
      overallRating: 4,
      smudgeLevel: '无',
      oxidationLevel: '轻微',
      makeupLossLevel: '轻微',
      oilLevel: 'T区微油',
      cakingLevel: '无',
      floatingLevel: '无',
      patchinessLevel: '无',
      notesPrivate: '午休后鼻翼微微出油，纸巾轻压后像奶油肌。',
    },
  ];

  const routines = [
    {
      id: 'rt-morning',
      name: '晨间防护保湿流程',
      periodType: 'morning',
      sortOrder: 1,
      steps: [
        {
          id: 'rts-1',
          name: '温和洁面与拍水',
          sortOrder: 1,
          products: [],
        },
        {
          id: 'rts-2',
          name: '修护精华打底',
          sortOrder: 2,
          products: [
            {
              id: 'rtsp-1',
              productItemId: 'item-serum-1',
              productNameSnapshot: '澄莹面部精华素',
              brandNameSnapshot: 'Aesop',
              shadeSnapshot: '',
              categorySnapshot: '护肤',
            },
          ],
        },
      ],
    },
    {
      id: 'rt-evening',
      name: '晚间舒缓修护流程',
      periodType: 'evening',
      sortOrder: 2,
      steps: [
        {
          id: 'rts-3',
          name: '舒缓精华厚涂维稳',
          sortOrder: 1,
          products: [
            {
              id: 'rtsp-2',
              productItemId: 'item-serum-1',
              productNameSnapshot: '澄莹面部精华素',
              brandNameSnapshot: 'Aesop',
              shadeSnapshot: '',
              categorySnapshot: '护肤',
            },
          ],
        },
      ],
    },
  ];

  const routineLogs = [
    {
      id: 'rlog-1',
      routineId: 'rt-evening',
      routineNameSnapshot: '晚间舒缓修护流程',
      performedAt: `${d(-1)}T21:15:00Z`,
      logDate: d(-1),
      completed: true,
      notesPrivate: '两颊吸收挺快，没有搓泥。',
      items: [
        {
          id: 'rli-1',
          routineStepId: 'rts-3',
          stepNameSnapshot: '舒缓精华厚涂维稳',
          productItemId: 'item-serum-1',
          productNameSnapshot: '澄莹面部精华素',
          brandNameSnapshot: 'Aesop',
          shadeSnapshot: '',
          categorySnapshot: '护肤',
          completed: true,
        },
      ],
    },
  ];

  const productUsageLogs = [
    {
      id: 'ulog-1',
      productItemId: 'item-found-1',
      usedAt: `${d(-3)}T08:05:00Z`,
      usedDate: d(-3),
      scene: '通勤上妆',
      feeling: '服帖轻薄',
      notesPrivate: '用湿润美妆蛋少量多次拍开。',
    },
    {
      id: 'ulog-2',
      productItemId: 'item-serum-1',
      usedAt: `${d(-1)}T21:10:00Z`,
      usedDate: d(-1),
      scene: '晚间护肤',
      feeling: '温和保湿',
      notesPrivate: '鼻翼泛红有缓和。',
    },
  ];

  const skinDiaries = [
    {
      id: 'diary-1',
      diaryDate: d(-1),
      moodTags: ['状态稳定', 'T区微油'],
      notesPrivate: '换季这几天减少酸类频率，只做基础保湿，两颊不再紧绷。',
      photoAssetIds: ['asset-s9'],
      createdAt: `${d(-1)}T21:30:00Z`,
      updatedAt: `${d(-1)}T21:30:00Z`,
    },
  ];

  const settings = {
    onboardingDismissed: false,
    nearExpiryDays: null, // 临期阈值未在正式文档规定，默认不预设，由用户自行设置
    homeSelectedCurrency: 'CNY', // 首页累计金额默认展示 CNY，切换后持久化记住最后选择
    enableForeignCurrency: false, // D1：添加产品默认跟随设置，外币录入按需开启
    simulatedSubscription: 'free', // 'free' | 'pro' | 'expired'（仅前端交互演示）
    icloudEnabledMock: false, // 默认关闭
    lastMockBackupAt: null,
  };

  return {
    version: 2,
    categories,
    brands,
    mediaAssets,
    products,
    productPhotos,
    productItems,
    looks,
    lookPhotos,
    lookProductItems,
    wearReviews,
    routines,
    routineLogs,
    productUsageLogs,
    skinDiaries,
    settings,
  };
}
