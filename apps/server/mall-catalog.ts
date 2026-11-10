import type { MallItem } from "../../packages/contracts/src/mall.js";

/**
 * Real pieces from three shops' public catalogs (Everlane, Taylor Stitch, Allbirds), for trying
 * the Mall with real clothes. Pictures load from the shops' own image servers and buying opens
 * the shop's own page; names, prices and stock per city are demo data, not live.
 */
export const catalog: MallItem[] = [
  {
    id: "ev-duffle-taupe",
    storeId: "everlane",
    name: "Overnight duffle, taupe",
    slot: "bag",
    price: 12800,
    url: "https://www.everlane.com/products/u-dfl-epoly-ovrnte-zp-chocc",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-08_U-DFL-EPOLY-OVRNTE-ZP-CHOCC_flat_3.jpg",
    stock: {
      Tokyo: 6,
      "New York": 3,
      London: 3,
    },
  },
  {
    id: "ev-backpack-navy",
    storeId: "everlane",
    name: "Small backpack, navy",
    slot: "bag",
    price: 11800,
    url: "https://www.everlane.com/products/u-bpck-nyle-flp-sm-nvy",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-08_U-BPCK-NYLE-FLP-SM-NVY_flat.jpg",
    stock: {
      London: 2,
      Lagos: 2,
      Tokyo: 2,
    },
  },
  {
    id: "ev-crew-plum",
    storeId: "everlane",
    name: "Tissue crew tee, plum",
    slot: "top",
    price: 4800,
    url: "https://www.everlane.com/products/f-t-tis-cr-ss-wine",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-T-TIS-CR-SS-WINE_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/Reshoot_2026-11-15_F-T-TIS-CR-SS-WINE_03.jpg",
    stock: {
      Tokyo: 6,
      Lagos: 3,
      London: 1,
    },
  },
  {
    id: "ev-longsleeve-lilac",
    storeId: "everlane",
    name: "Tissue long-sleeve, lilac",
    slot: "top",
    price: 5800,
    url: "https://www.everlane.com/products/f-t-tis-cr-ls-lilc",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-T-TIS-CR-LS-LILC_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/Reshoot_2026-11-15_F-T-TIS-CR-LS-LILC_01.jpg",
    stock: {
      Mumbai: 3,
      London: 5,
      Jakarta: 1,
    },
  },
  {
    id: "ev-tieneck-black",
    storeId: "everlane",
    name: "Tie-neck top, black",
    slot: "top",
    price: 7800,
    url: "https://www.everlane.com/products/f-t-tis-tie-ls-blk",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-T-TIS-TIE-LS-BLK_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/Reshoot_2026-11-15_F-T-TIS-TIE-LS-BLK_01.jpg",
    stock: {
      Seoul: 1,
      Lagos: 3,
      London: 2,
      Mumbai: 4,
    },
  },
  {
    id: "ev-teddy-coffee",
    storeId: "everlane",
    name: "Teddy fleece jacket, coffee",
    slot: "outer",
    price: 14800,
    url: "https://www.everlane.com/products/f-otwr-ret-coc-jkt-brn",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-OTWR-RET-COC-JKT-BRN_flat.jpg",
    stock: {
      Tokyo: 1,
      Mumbai: 3,
      Jakarta: 4,
      London: 1,
    },
  },
  {
    id: "ev-teddy-bone",
    storeId: "everlane",
    name: "Teddy fleece jacket, bone",
    slot: "outer",
    price: 14800,
    url: "https://www.everlane.com/products/f-otwr-ret-coc-jkt-bone",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-11-15_F-OTWR-RET-COC-JKT-BONE_flat.jpg",
    stock: {
      London: 3,
      Lagos: 3,
      Tokyo: 2,
      "New York": 6,
    },
  },
  {
    id: "ev-liner-olive",
    storeId: "everlane",
    name: "Nylon liner jacket, olive",
    slot: "outer",
    price: 12500,
    url: "https://www.everlane.com/products/f-owr-qln-line-rev-olv",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-09-27_F-OWR-QLN-LINE-REV-OLV_flat.jpg",
    stock: {
      Jakarta: 1,
      "New York": 6,
      London: 2,
    },
  },
  {
    id: "ev-chino-olive",
    storeId: "everlane",
    name: "Straight chino, olive",
    slot: "bottom",
    price: 11800,
    url: "https://www.everlane.com/products/m-btm-hrc-strt-pnt-olv-men-s-core-size-range",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-STRT-PNT-OLV_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-STRT-PNT-OLV_M1.jpg",
    stock: {
      Tokyo: 2,
      Lagos: 1,
      Seoul: 4,
      Mumbai: 2,
      London: 3,
    },
  },
  {
    id: "ev-chino-black",
    storeId: "everlane",
    name: "Slim chino, black",
    slot: "bottom",
    price: 11800,
    url: "https://www.everlane.com/products/m-btm-hrc-slim-pnt-black",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-SLIM-PNT-BLK_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-SLIM-PNT-BLK_M1.jpg",
    stock: {
      London: 5,
      Lagos: 1,
    },
  },
  {
    id: "ev-chino-cocoa",
    storeId: "everlane",
    name: "Slim chino, cocoa",
    slot: "bottom",
    price: 11800,
    url: "https://www.everlane.com/products/m-btm-hrc-slim-pnt-cocoa",
    image:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-SLIM-PNT-COCO_flat.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0623/7916/3734/files/2026-10-25_M-BTM-HRC-SLIM-PNT-COCO_M1.jpg",
    stock: {
      Mumbai: 6,
      London: 3,
      "São Paulo": 3,
      Jakarta: 6,
    },
  },
  {
    id: "ts-cutter-plaid",
    storeId: "taylorstitch",
    name: "Cutter overshirt, timber plaid",
    slot: "top",
    price: 17800,
    url: "https://www.taylorstitch.com/products/cutter-overshirt-in-timber-plaid-2510",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/instock_m_q425_The_Cutter_Overshirt-TimberPlaid_portrait_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/instock_m_q425_The_Cutter_Overshirt-TimberPlaid_portrait_002.jpg",
    stock: {
      "São Paulo": 2,
      Jakarta: 3,
      Seoul: 6,
      Lagos: 2,
      London: 1,
    },
  },
  {
    id: "ts-jack-wheat",
    storeId: "taylorstitch",
    name: "The Jack shirt, wheat check",
    slot: "top",
    price: 13800,
    url: "https://www.taylorstitch.com/products/jack-in-wheat-glenn-check-twill-2611",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_TheJack-WheatGlennChecklTwill_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_TheJack-WheatGlennChecklTwill_PDP_003.jpg",
    stock: {
      Seoul: 4,
      "New York": 4,
      London: 5,
    },
  },
  {
    id: "ts-carnegie-olive",
    storeId: "taylorstitch",
    name: "Carnegie pant, olive moleskin",
    slot: "bottom",
    price: 16800,
    url: "https://www.taylorstitch.com/products/carnegie-pant-in-fatigue-olive-washed-moleskin-2611",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_carnegiepant_fatigueolive_moleskin_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_carnegiepant_fatigueolive_moleskin_PDP_003.jpg",
    stock: {
      "São Paulo": 2,
      "New York": 1,
      London: 1,
    },
  },
  {
    id: "ts-deck-khaki",
    storeId: "taylorstitch",
    name: "Deck pant, khaki cord",
    slot: "bottom",
    price: 14800,
    url: "https://www.taylorstitch.com/products/deck-pant-in-khaki-bedford-cord-2512",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Deck_Pant_in_Khaki_Bedford_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Deck_Pant_in_Khaki_Bedford_PDP_002.jpg",
    stock: {
      London: 5,
      Seoul: 2,
    },
  },
  {
    id: "ts-drover-suede",
    storeId: "taylorstitch",
    name: "Drover jacket, bourbon suede",
    slot: "outer",
    price: 79800,
    url: "https://www.taylorstitch.com/products/drover-jacket-in-bourbon-suede-2611",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_TheDroverJacketinBourbonSuede_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_TheDroverJacketinBourbonSuede_PDP_002.jpg",
    stock: {
      Jakarta: 2,
      London: 5,
      Tokyo: 1,
    },
  },
  {
    id: "ts-riley-navy",
    storeId: "taylorstitch",
    name: "Riley sportcoat, navy cord",
    slot: "outer",
    price: 23800,
    url: "https://www.taylorstitch.com/products/riley-sportcoat-in-dark-navy-corduroy-2611",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Riley_Sportcoat_in_Dark_Navy_Corduroy_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Riley_Sportcoat_in_Dark_Navy_Corduroy_PDP_003.jpg",
    stock: {
      Lagos: 4,
      "São Paulo": 2,
      London: 1,
    },
  },
  {
    id: "ts-field-olive",
    storeId: "taylorstitch",
    name: "Field jacket, burnt olive",
    slot: "outer",
    price: 23800,
    url: "https://www.taylorstitch.com/products/field-jacket-in-burnt-olive-ripstop-2612",
    image:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Field_Jacket_in_Burnt_Olive_Ripstop_PDP_001.jpg",
    photo:
      "https://cdn.shopify.com/s/files/1/0070/1922/files/Q426_The_Field_Jacket_in_Burnt_Olive_Ripstop_PDP_002.jpg",
    stock: {
      Tokyo: 2,
      Mumbai: 6,
      "São Paulo": 3,
      London: 2,
    },
  },
  {
    id: "ab-cruiser-yellow",
    storeId: "allbirds",
    name: "Cruiser, buoy yellow",
    slot: "shoes",
    price: 12000,
    url: "https://www.allbirds.com/products/mens-cruiser-buoy-yellow-natural-white-sole",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/A12825M090-BUOY_YELLOW_SIDE_TRANSPARENT.png",
    stock: {
      Lagos: 2,
      Seoul: 3,
      London: 3,
      Tokyo: 3,
    },
  },
  {
    id: "ab-tree-runner-black",
    storeId: "allbirds",
    name: "Tree Runner, jet black",
    slot: "shoes",
    price: 7000,
    url: "https://www.allbirds.com/products/mens-tree-runners",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/TR3MJBW080_SHOE_LEFT_GLOBAL_MENS_TREE_RUNNER_JET_BLACK_WHITE.png",
    stock: {
      Seoul: 4,
      "São Paulo": 4,
      Lagos: 4,
      London: 5,
    },
  },
  {
    id: "ab-strider-red",
    storeId: "allbirds",
    name: "Strider, warm red",
    slot: "shoes",
    price: 13000,
    url: "https://www.allbirds.com/products/mens-strider-warm-red",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/A12329_26Q1_Strider-Warm-Red-Mushroom_PDP_LEFT.png",
    stock: {
      "New York": 2,
      Jakarta: 4,
      "São Paulo": 2,
      London: 1,
    },
  },
  {
    id: "ab-varsity-mushroom",
    storeId: "allbirds",
    name: "Varsity, mushroom",
    slot: "shoes",
    price: 7200,
    url: "https://www.allbirds.com/products/womens-varsity-mushroom",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/A12593_26Q2_Womens-Varsity-Mushroom-Blizzard-Sole_PDP_LEFT.png",
    stock: {
      London: 1,
      Tokyo: 1,
      Jakarta: 3,
    },
  },
  {
    id: "ab-wool-runner-grey",
    storeId: "allbirds",
    name: "Wool Runner, natural grey",
    slot: "shoes",
    price: 11000,
    url: "https://www.allbirds.com/products/mens-wool-runners",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/Allbirds_WL_RN_SF_PDP_Natural_Grey_LAT.png",
    stock: {
      Tokyo: 3,
      London: 1,
      Lagos: 1,
      Jakarta: 3,
    },
  },
  {
    id: "ab-cruiser-white",
    storeId: "allbirds",
    name: "Cruiser, blizzard white",
    slot: "shoes",
    price: 6300,
    url: "https://www.allbirds.com/products/womens-cruiser",
    image:
      "https://cdn.shopify.com/s/files/1/1104/4168/files/A11556_25Q3_Cruiser_Blizzard_Blizzard_PDP_LEFT-2000x2000_c7e02c35-b818-43b7-a332-bccf975bdff4.png",
    stock: {
      Tokyo: 2,
      Jakarta: 4,
      Lagos: 1,
      London: 3,
    },
  },
];
