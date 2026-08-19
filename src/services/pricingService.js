const Setting = require('../models/Setting');

exports.calculatePricing = async (providerPrice) => {
  const settings = await Setting.findOne();
  
  const marginType = settings ? settings.marginType : 'percentage';
  const marginValue = settings ? settings.marginValue : 20;

  let sellingPrice = providerPrice;
  let profit = 0;

  if (marginType === 'percentage') {
    profit = Math.ceil(providerPrice * (marginValue / 100));
    sellingPrice = providerPrice + profit;
  } else if (marginType === 'fixed') {
    profit = marginValue;
    sellingPrice = providerPrice + profit;
  }

  return {
    providerPrice,
    sellingPrice,
    profit
  };
};