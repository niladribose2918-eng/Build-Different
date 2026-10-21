// Indian dishes, each written out as a standard home recipe built from USDA SR28 ingredients.
//
// The Indian Food Composition Tables (NIN, 2017) carry a copyright notice and no open licence,
// so their values cannot ship here. Instead every dish is a recipe anyone can check: raw
// ingredients in grams, the finished weight the batch cooks down (or up, with water) to, and the
// household portions people log. build-foods.mjs adds the ingredients up and divides by the
// finished weight. Home cooking varies a lot — oil above all — so these are estimates, and the
// app says so on every one of them.
//
//   id        stable key, logged as `in:<id>`; never reuse or rename one that has shipped
//   name      what the app shows; aliases are what people type instead
//   group     the food group its icon comes from
//   ing       [[USDA SR28 number, grams raw], …] — water is not listed, the finished weight covers it
//   yield     grams of finished dish this batch makes
//   portions  [[label, grams], …], the first one is the default
//   note      anything a reviewer should know (proxies, assumptions)
const I = {
  toor: '16101', masoor: '16144', moong: '16080', urad: '16083', chana: '16056', rajma: '16032',
  rice: '20044', atta: '20080', maida: '20081', sooji: '20066', besan: '16157',
  oil: '04669', ghee: '01003', mustardOil: '04583', butter: '01001',
  onion: '11282', tomato: '11529', potato: '11352', cauli: '11135', okra: '11278', brinjal: '11209',
  spinach: '11457', peas: '11304', carrot: '11124', beans: '11052', capsicum: '11333', cabbage: '11109',
  garlic: '11215', ginger: '11216', chili: '11670', lauki: '11218', karela: '11024', mushroom: '11260',
  cucumber: '11205', cilantro: '11165', mango: '09176',
  milk: '01077', curd: '01116', cream: '01053', paneer: '01228',
  chicken: '05011', goat: '17168', fish: '15008', egg: '01123', shrimp: '15149',
  coconut: '12104', peanuts: '16087', cashew: '12087', almonds: '12061', sugar: '19335', jaggery: '19334',
  tamarind: '09322', lemon: '09152', sprouts: '11043', pav: '18342', tea: '14355', coffee: '14209',
  moth: '16078', milletFlour: '20647', jowarFlour: '20648', puffedRice: '08156',
}
// What each ingredient is called on a shopping list (lib/grocery.js). null leaves it off: brewed
// tea and coffee are cups, not something you buy by the gram.
export const SHOP = {
  toor: 'Toor dal', masoor: 'Masoor dal', moong: 'Moong dal', urad: 'Urad dal', chana: 'Chana dal', rajma: 'Rajma',
  rice: 'Rice', atta: 'Atta (whole wheat flour)', maida: 'Maida', sooji: 'Sooji (rava)', besan: 'Besan',
  oil: 'Cooking oil', ghee: 'Ghee', mustardOil: 'Mustard oil', butter: 'Butter',
  onion: 'Onions', tomato: 'Tomatoes', potato: 'Potatoes', cauli: 'Cauliflower', okra: 'Bhindi (okra)', brinjal: 'Brinjal',
  spinach: 'Spinach', peas: 'Green peas', carrot: 'Carrots', beans: 'French beans', capsicum: 'Capsicum', cabbage: 'Cabbage',
  garlic: 'Garlic', ginger: 'Ginger', chili: 'Green chillies', lauki: 'Lauki (bottle gourd)', karela: 'Karela', mushroom: 'Mushrooms',
  cucumber: 'Cucumber', cilantro: 'Coriander leaves', mango: 'Mango',
  milk: 'Milk', curd: 'Curd (dahi)', cream: 'Cream', paneer: 'Paneer',
  chicken: 'Chicken, boneless', goat: 'Mutton, boneless', fish: 'Fish (rohu or carp)', egg: 'Eggs', shrimp: 'Prawns',
  coconut: 'Coconut', peanuts: 'Peanuts', cashew: 'Cashews', almonds: 'Almonds', sugar: 'Sugar', jaggery: 'Jaggery',
  tamarind: 'Tamarind', lemon: 'Lemons', sprouts: 'Moong sprouts', pav: 'Pav', tea: null, coffee: null,
  moth: 'Moth beans (matki)', milletFlour: 'Bajra flour', jowarFlour: 'Jowar flour', puffedRice: 'Puffed rice (murmura)',
}
export const INGREDIENT_IDS = I

const KATORI = ['katori', 150], BOWL = ['bowl', 250], PLATE = ['plate', 250], GLASS = ['glass', 250], CUP = ['cup', 150]

export default [
  // ── dals ──
  { id: 'paneer', name: 'Paneer', aliases: ['cottage cheese indian', 'chhena'], group: 'dairy', ing: [[I.paneer, 100]], yield: 100, portions: [['100 g', 100], ['piece', 25]], note: 'USDA has no paneer; values are queso fresco, a similar fresh cheese. Home paneer is often a little lower in fat.' },
  { id: 'toor-dal', name: 'Toor dal (tadka)', aliases: ['arhar dal', 'dal tadka', 'tuvar dal', 'yellow dal'], group: 'dal', ing: [[I.toor, 100], [I.oil, 10], [I.onion, 40], [I.tomato, 60], [I.garlic, 5]], yield: 550, portions: [KATORI, BOWL] },
  { id: 'moong-dal', name: 'Moong dal (yellow)', aliases: ['moong dal tadka', 'mung dal'], group: 'dal', ing: [[I.moong, 100], [I.ghee, 8], [I.onion, 30], [I.tomato, 40], [I.garlic, 3]], yield: 550, portions: [KATORI, BOWL] },
  { id: 'masoor-dal', name: 'Masoor dal', aliases: ['red lentil dal', 'lal dal'], group: 'dal', ing: [[I.masoor, 100], [I.oil, 10], [I.onion, 40], [I.tomato, 50]], yield: 550, portions: [KATORI, BOWL] },
  { id: 'dal-fry', name: 'Dal fry', aliases: ['dhaba dal'], group: 'dal', ing: [[I.toor, 100], [I.oil, 20], [I.ghee, 5], [I.onion, 60], [I.tomato, 80]], yield: 550, portions: [KATORI, BOWL] },
  { id: 'dal-makhani', name: 'Dal makhani', aliases: ['maa ki dal', 'kaali dal'], group: 'dal', ing: [[I.urad, 70], [I.rajma, 30], [I.butter, 15], [I.cream, 30], [I.onion, 50], [I.tomato, 100], [I.garlic, 6], [I.ginger, 6]], yield: 600, portions: [KATORI, BOWL] },
  { id: 'chana-dal', name: 'Chana dal', aliases: ['bengal gram dal'], group: 'dal', ing: [[I.chana, 100], [I.oil, 10], [I.onion, 40], [I.tomato, 50]], yield: 500, portions: [KATORI, BOWL] },
  { id: 'sabut-moong', name: 'Whole moong dal', aliases: ['sabut moong', 'green moong curry'], group: 'dal', ing: [[I.moong, 100], [I.oil, 10], [I.onion, 40], [I.tomato, 60]], yield: 550, portions: [KATORI, BOWL] },
  { id: 'sambar', name: 'Sambar', aliases: ['sambhar'], group: 'dal', ing: [[I.toor, 60], [I.oil, 8], [I.tamarind, 10], [I.onion, 50], [I.tomato, 60], [I.brinjal, 50], [I.carrot, 40], [I.okra, 30]], yield: 800, portions: [KATORI, BOWL] },
  { id: 'rasam', name: 'Rasam', aliases: ['saaru'], group: 'dal', ing: [[I.toor, 20], [I.tomato, 120], [I.tamarind, 10], [I.ghee, 5]], yield: 500, portions: [KATORI, CUP] },
  { id: 'rajma', name: 'Rajma masala', aliases: ['rajma curry', 'kidney bean curry'], group: 'dal', ing: [[I.rajma, 100], [I.oil, 15], [I.onion, 80], [I.tomato, 120], [I.ginger, 5], [I.garlic, 5]], yield: 600, portions: [KATORI, BOWL] },
  { id: 'chole', name: 'Chole (chana masala)', aliases: ['chana masala', 'chickpea curry', 'chhole'], group: 'dal', ing: [[I.chana, 100], [I.oil, 15], [I.onion, 80], [I.tomato, 120], [I.ginger, 5], [I.garlic, 5]], yield: 600, portions: [KATORI, BOWL] },
  { id: 'kadhi', name: 'Kadhi', aliases: ['kadi'], group: 'dal', ing: [[I.besan, 40], [I.curd, 250], [I.oil, 10], [I.onion, 20]], yield: 600, portions: [KATORI, BOWL] },
  { id: 'kadhi-pakora', name: 'Kadhi pakora', aliases: ['kadi pakoda'], group: 'dal', ing: [[I.besan, 70], [I.curd, 250], [I.oil, 25], [I.onion, 40]], yield: 650, portions: [KATORI, BOWL], note: 'Includes the oil the pakoras absorb when fried.' },
  { id: 'misal', name: 'Misal (usal only)', aliases: ['misal pav', 'usal', 'matki usal'], group: 'dal', ing: [[I.moth, 80], [I.oil, 15], [I.onion, 50], [I.tomato, 50], [I.potato, 30]], yield: 500, portions: [KATORI, BOWL], note: 'Log the pav and the farsan on top separately.' },
  { id: 'chana-chaat', name: 'Chana chaat', aliases: ['chickpea chaat', 'chole chaat'], group: 'side', ing: [[I.chana, 60], [I.onion, 20], [I.tomato, 30], [I.cucumber, 20], [I.lemon, 5]], yield: 235, portions: [KATORI, BOWL] },

  // ── rice ──
  { id: 'jeera-rice', name: 'Jeera rice', aliases: ['cumin rice'], group: 'rice', ing: [[I.rice, 100], [I.ghee, 8]], yield: 300, portions: [KATORI, PLATE] },
  { id: 'veg-pulao', name: 'Veg pulao', aliases: ['pulav', 'vegetable pulao'], group: 'rice', ing: [[I.rice, 100], [I.oil, 10], [I.peas, 40], [I.carrot, 40], [I.beans, 20], [I.onion, 30]], yield: 420, portions: [KATORI, PLATE] },
  { id: 'chicken-biryani', name: 'Chicken biryani', aliases: ['biriyani'], group: 'rice', ing: [[I.rice, 150], [I.chicken, 200], [I.curd, 50], [I.oil, 20], [I.ghee, 10], [I.onion, 100], [I.tomato, 40]], yield: 750, portions: [PLATE, KATORI] },
  { id: 'mutton-biryani', name: 'Mutton biryani', aliases: ['goat biryani'], group: 'rice', ing: [[I.rice, 150], [I.goat, 200], [I.curd, 50], [I.oil, 20], [I.ghee, 10], [I.onion, 100]], yield: 750, portions: [PLATE, KATORI] },
  { id: 'veg-biryani', name: 'Veg biryani', aliases: ['vegetable biryani'], group: 'rice', ing: [[I.rice, 150], [I.oil, 20], [I.ghee, 5], [I.potato, 60], [I.carrot, 40], [I.beans, 30], [I.peas, 40], [I.onion, 80], [I.curd, 40]], yield: 750, portions: [PLATE, KATORI] },
  { id: 'egg-biryani', name: 'Egg biryani', aliases: ['anda biryani'], group: 'rice', ing: [[I.rice, 150], [I.egg, 150], [I.oil, 20], [I.ghee, 10], [I.onion, 100], [I.tomato, 40]], yield: 700, portions: [PLATE, KATORI] },
  { id: 'khichdi', name: 'Khichdi', aliases: ['khichri', 'dal khichdi'], group: 'rice', ing: [[I.rice, 60], [I.moong, 40], [I.ghee, 10]], yield: 450, portions: [KATORI, BOWL] },
  { id: 'curd-rice', name: 'Curd rice', aliases: ['thayir sadam', 'dahi chawal'], group: 'rice', ing: [[I.rice, 60], [I.curd, 150], [I.milk, 30], [I.oil, 3]], yield: 360, portions: [KATORI, BOWL] },
  { id: 'lemon-rice', name: 'Lemon rice', aliases: ['chitranna'], group: 'rice', ing: [[I.rice, 100], [I.oil, 12], [I.peanuts, 15], [I.lemon, 15]], yield: 330, portions: [KATORI, PLATE] },
  { id: 'coconut-rice', name: 'Coconut rice', aliases: [], group: 'rice', ing: [[I.rice, 100], [I.coconut, 40], [I.oil, 10]], yield: 350, portions: [KATORI, PLATE] },
  { id: 'veg-fried-rice', name: 'Veg fried rice', aliases: ['fried rice'], group: 'rice', ing: [[I.rice, 100], [I.oil, 15], [I.carrot, 30], [I.cabbage, 30], [I.capsicum, 20], [I.beans, 20]], yield: 380, portions: [PLATE, KATORI] },
  { id: 'chicken-fried-rice', name: 'Chicken fried rice', aliases: [], group: 'rice', ing: [[I.rice, 100], [I.chicken, 80], [I.egg, 50], [I.oil, 15], [I.carrot, 25], [I.cabbage, 25]], yield: 420, portions: [PLATE, KATORI] },
  { id: 'pongal', name: 'Ven pongal', aliases: ['pongal', 'khara pongal'], group: 'rice', ing: [[I.rice, 50], [I.moong, 20], [I.ghee, 12], [I.cashew, 5]], yield: 300, portions: [KATORI, PLATE] },

  // ── breads ──
  { id: 'roti', name: 'Roti / chapati', aliases: ['chapati', 'chapatti', 'fulka', 'phulka', 'rotli'], group: 'bread', ing: [[I.atta, 30]], yield: 40, portions: [['roti', 40]], note: 'Plain, no ghee on top.' },
  { id: 'roti-ghee', name: 'Roti with ghee', aliases: ['chapati with ghee', 'ghee phulka'], group: 'bread', ing: [[I.atta, 30], [I.ghee, 3]], yield: 43, portions: [['roti', 43]] },
  { id: 'paratha', name: 'Paratha (plain)', aliases: ['parantha', 'lachha paratha'], group: 'bread', ing: [[I.atta, 45], [I.oil, 7]], yield: 70, portions: [['paratha', 70]] },
  { id: 'aloo-paratha', name: 'Aloo paratha', aliases: ['potato paratha'], group: 'bread', ing: [[I.atta, 50], [I.potato, 60], [I.oil, 8], [I.onion, 10]], yield: 125, portions: [['paratha', 125]] },
  { id: 'gobi-paratha', name: 'Gobi paratha', aliases: ['cauliflower paratha'], group: 'bread', ing: [[I.atta, 50], [I.cauli, 50], [I.oil, 8]], yield: 110, portions: [['paratha', 110]] },
  { id: 'paneer-paratha', name: 'Paneer paratha', aliases: [], group: 'bread', ing: [[I.atta, 50], [I.paneer, 40], [I.oil, 8]], yield: 110, portions: [['paratha', 110]] },
  { id: 'thepla', name: 'Methi thepla', aliases: ['thepla'], group: 'bread', ing: [[I.atta, 40], [I.besan, 10], [I.curd, 10], [I.oil, 5], [I.spinach, 15]], yield: 75, portions: [['thepla', 75]], note: 'Fenugreek leaves are not in the USDA data; spinach stands in for the same small amount.' },
  { id: 'naan', name: 'Naan', aliases: ['nan'], group: 'bread', ing: [[I.maida, 70], [I.curd, 10], [I.butter, 5], [I.oil, 3]], yield: 100, portions: [['naan', 100]] },
  { id: 'butter-naan', name: 'Butter naan', aliases: [], group: 'bread', ing: [[I.maida, 70], [I.curd, 10], [I.butter, 15], [I.oil, 3]], yield: 110, portions: [['naan', 110]] },
  { id: 'puri', name: 'Puri', aliases: ['poori'], group: 'bread', ing: [[I.atta, 20], [I.oil, 6]], yield: 30, portions: [['puri', 30]], note: 'Includes the oil a deep-fried puri absorbs.' },
  { id: 'bhatura', name: 'Bhatura', aliases: ['bhature'], group: 'bread', ing: [[I.maida, 50], [I.curd, 10], [I.oil, 12]], yield: 80, portions: [['bhatura', 80]] },
  { id: 'missi-roti', name: 'Missi roti', aliases: [], group: 'bread', ing: [[I.atta, 20], [I.besan, 15], [I.oil, 3]], yield: 45, portions: [['roti', 45]] },
  { id: 'bajra-roti', name: 'Bajra roti', aliases: ['bajre ki roti', 'bajri bhakri', 'millet roti'], group: 'bread', ing: [[I.milletFlour, 40]], yield: 55, portions: [['roti', 55]], note: 'Plain, no ghee on top.' },
  { id: 'jowar-roti', name: 'Jowar roti', aliases: ['jowar bhakri', 'jolada rotti', 'sorghum roti'], group: 'bread', ing: [[I.jowarFlour, 40]], yield: 55, portions: [['roti', 55]], note: 'Plain, no ghee on top.' },
  { id: 'pav', name: 'Pav (bread roll)', aliases: ['pao', 'bun'], group: 'bread', ing: [[I.pav, 100]], yield: 100, portions: [['pav', 40]] },

  // ── south Indian and breakfast ──
  { id: 'idli', name: 'Idli', aliases: ['idly'], group: 'breakfast', ing: [[I.rice, 60], [I.urad, 20]], yield: 200, portions: [['idli', 40]] },
  { id: 'dosa', name: 'Dosa (plain)', aliases: ['dosai', 'plain dosa'], group: 'breakfast', ing: [[I.rice, 30], [I.urad, 10], [I.oil, 4]], yield: 70, portions: [['dosa', 70]] },
  { id: 'masala-dosa', name: 'Masala dosa', aliases: [], group: 'breakfast', ing: [[I.rice, 30], [I.urad, 10], [I.oil, 10], [I.potato, 100], [I.onion, 20]], yield: 190, portions: [['dosa', 190]] },
  { id: 'rava-dosa', name: 'Rava dosa', aliases: ['rava dosai'], group: 'breakfast', ing: [[I.sooji, 20], [I.maida, 10], [I.rice, 10], [I.oil, 6]], yield: 80, portions: [['dosa', 80]] },
  { id: 'uttapam', name: 'Uttapam', aliases: ['uthappam', 'oothappam'], group: 'breakfast', ing: [[I.rice, 40], [I.urad, 13], [I.oil, 6], [I.onion, 25], [I.tomato, 20]], yield: 140, portions: [['uttapam', 140]] },
  { id: 'medu-vada', name: 'Medu vada', aliases: ['vada', 'uzhunnu vada'], group: 'breakfast', ing: [[I.urad, 30], [I.oil, 10]], yield: 70, portions: [['vada', 35]], note: 'Includes the oil a deep-fried vada absorbs.' },
  { id: 'upma', name: 'Upma', aliases: ['uppittu', 'rava upma'], group: 'breakfast', ing: [[I.sooji, 50], [I.oil, 8], [I.onion, 20], [I.peas, 10], [I.carrot, 10]], yield: 200, portions: [['plate', 200], KATORI] },
  { id: 'poha', name: 'Poha', aliases: ['pohe', 'aval', 'flattened rice'], group: 'breakfast', ing: [[I.rice, 40], [I.oil, 6], [I.onion, 25], [I.potato, 25], [I.peanuts, 6]], yield: 160, portions: [['plate', 160], KATORI], note: 'Flattened rice is not in the USDA data; raw rice, the same grain, stands in for it.' },
  { id: 'besan-chilla', name: 'Besan chilla', aliases: ['cheela', 'besan cheela', 'puda'], group: 'breakfast', ing: [[I.besan, 40], [I.oil, 6], [I.onion, 15], [I.tomato, 15]], yield: 100, portions: [['chilla', 100]] },
  { id: 'moong-chilla', name: 'Moong dal chilla', aliases: ['moong cheela', 'pesarattu'], group: 'breakfast', ing: [[I.moong, 40], [I.oil, 6], [I.onion, 15]], yield: 110, portions: [['chilla', 110]] },
  { id: 'dhokla', name: 'Dhokla', aliases: ['khaman'], group: 'breakfast', ing: [[I.besan, 50], [I.curd, 25], [I.oil, 5], [I.sugar, 3]], yield: 150, portions: [['piece', 30], ['plate', 150]] },
  { id: 'appam', name: 'Appam', aliases: [], group: 'breakfast', ing: [[I.rice, 50], [I.coconut, 15]], yield: 120, portions: [['appam', 60]] },
  { id: 'coconut-chutney', name: 'Coconut chutney', aliases: ['nariyal chutney'], group: 'side', ing: [[I.coconut, 60], [I.chana, 10], [I.oil, 3]], yield: 100, portions: [['tbsp', 15], ['katori', 50]] },
  { id: 'green-chutney', name: 'Green chutney', aliases: ['hari chutney', 'pudina chutney', 'dhaniya chutney'], group: 'side', ing: [[I.cilantro, 50], [I.chili, 5], [I.lemon, 5], [I.peanuts, 5]], yield: 70, portions: [['tbsp', 15]] },

  // ── paneer and vegetables ──
  { id: 'paneer-bhurji', name: 'Paneer bhurji', aliases: ['scrambled paneer'], group: 'curry', ing: [[I.paneer, 150], [I.oil, 10], [I.onion, 50], [I.tomato, 50], [I.capsicum, 20]], yield: 260, portions: [KATORI] },
  { id: 'palak-paneer', name: 'Palak paneer', aliases: ['saag paneer'], group: 'curry', ing: [[I.spinach, 300], [I.paneer, 120], [I.oil, 10], [I.cream, 15], [I.onion, 40], [I.tomato, 30]], yield: 450, portions: [KATORI, BOWL] },
  { id: 'paneer-butter-masala', name: 'Paneer butter masala', aliases: ['paneer makhani', 'paneer makhanwala'], group: 'curry', ing: [[I.paneer, 150], [I.butter, 15], [I.cream, 30], [I.tomato, 150], [I.onion, 40], [I.cashew, 10]], yield: 400, portions: [KATORI, BOWL] },
  { id: 'matar-paneer', name: 'Matar paneer', aliases: ['mutter paneer'], group: 'curry', ing: [[I.paneer, 120], [I.peas, 100], [I.oil, 12], [I.onion, 60], [I.tomato, 100]], yield: 420, portions: [KATORI, BOWL] },
  { id: 'kadai-paneer', name: 'Kadai paneer', aliases: ['karahi paneer'], group: 'curry', ing: [[I.paneer, 150], [I.capsicum, 80], [I.onion, 60], [I.tomato, 80], [I.oil, 15]], yield: 380, portions: [KATORI, BOWL] },
  { id: 'paneer-tikka', name: 'Paneer tikka', aliases: ['tikka paneer'], group: 'curry', ing: [[I.paneer, 200], [I.curd, 40], [I.capsicum, 50], [I.onion, 50], [I.oil, 10]], yield: 300, portions: [['serving', 150], ['piece', 25]] },
  { id: 'malai-kofta', name: 'Malai kofta', aliases: ['kofta curry'], group: 'curry', ing: [[I.paneer, 100], [I.potato, 100], [I.maida, 10], [I.oil, 30], [I.cream, 50], [I.cashew, 20], [I.tomato, 150], [I.onion, 50], [I.butter, 10]], yield: 520, portions: [KATORI, BOWL], note: 'Includes the oil the fried koftas absorb.' },
  { id: 'shahi-paneer', name: 'Shahi paneer', aliases: [], group: 'curry', ing: [[I.paneer, 150], [I.cream, 40], [I.cashew, 15], [I.curd, 30], [I.onion, 40], [I.ghee, 10]], yield: 380, portions: [KATORI, BOWL] },
  { id: 'aloo-gobi', name: 'Aloo gobi', aliases: ['potato cauliflower'], group: 'veg', ing: [[I.potato, 150], [I.cauli, 200], [I.oil, 15], [I.onion, 30], [I.tomato, 40]], yield: 380, portions: [KATORI, BOWL] },
  { id: 'jeera-aloo', name: 'Jeera aloo', aliases: ['aloo sabzi', 'potato sabzi', 'aloo fry'], group: 'veg', ing: [[I.potato, 250], [I.oil, 12]], yield: 240, portions: [KATORI] },
  { id: 'dum-aloo', name: 'Dum aloo', aliases: ['dum alu', 'kashmiri dum aloo'], group: 'veg', ing: [[I.potato, 300], [I.oil, 20], [I.curd, 60], [I.onion, 50], [I.tomato, 80]], yield: 430, portions: [KATORI, BOWL] },
  { id: 'aloo-matar', name: 'Aloo matar', aliases: ['aloo mutter'], group: 'veg', ing: [[I.potato, 150], [I.peas, 100], [I.oil, 12], [I.onion, 50], [I.tomato, 100]], yield: 420, portions: [KATORI, BOWL] },
  { id: 'bhindi-masala', name: 'Bhindi masala', aliases: ['bhindi fry', 'okra fry', 'bhindi sabzi'], group: 'veg', ing: [[I.okra, 250], [I.oil, 15], [I.onion, 60], [I.tomato, 40]], yield: 260, portions: [KATORI] },
  { id: 'baingan-bharta', name: 'Baingan bharta', aliases: ['bharta', 'brinjal bharta'], group: 'veg', ing: [[I.brinjal, 400], [I.oil, 12], [I.onion, 60], [I.tomato, 80]], yield: 380, portions: [KATORI] },
  { id: 'mixed-veg', name: 'Mixed veg sabzi', aliases: ['mix veg', 'mixed vegetable curry'], group: 'veg', ing: [[I.carrot, 60], [I.beans, 60], [I.peas, 60], [I.potato, 80], [I.cauli, 80], [I.oil, 15], [I.onion, 40], [I.tomato, 60]], yield: 400, portions: [KATORI, BOWL] },
  { id: 'cabbage-sabzi', name: 'Cabbage sabzi', aliases: ['patta gobi sabzi', 'bandh gobi'], group: 'veg', ing: [[I.cabbage, 300], [I.oil, 10], [I.peas, 30]], yield: 280, portions: [KATORI] },
  { id: 'lauki-sabzi', name: 'Lauki sabzi', aliases: ['dudhi', 'bottle gourd curry', 'ghiya'], group: 'veg', ing: [[I.lauki, 400], [I.oil, 8], [I.tomato, 40]], yield: 360, portions: [KATORI] },
  { id: 'karela-sabzi', name: 'Karela sabzi', aliases: ['bitter gourd fry'], group: 'veg', ing: [[I.karela, 250], [I.oil, 15], [I.onion, 60]], yield: 220, portions: [KATORI] },
  { id: 'mushroom-masala', name: 'Mushroom masala', aliases: ['mushroom curry'], group: 'veg', ing: [[I.mushroom, 250], [I.oil, 12], [I.onion, 60], [I.tomato, 80], [I.cream, 15]], yield: 300, portions: [KATORI] },
  { id: 'palak-aloo', name: 'Aloo palak', aliases: ['palak aloo', 'spinach potato'], group: 'veg', ing: [[I.spinach, 250], [I.potato, 120], [I.oil, 12], [I.onion, 40]], yield: 300, portions: [KATORI] },
  { id: 'sprouts-salad', name: 'Sprouts salad', aliases: ['moong sprouts chaat', 'sprouts chaat'], group: 'side', ing: [[I.sprouts, 150], [I.onion, 20], [I.tomato, 30], [I.lemon, 5]], yield: 205, portions: [KATORI, BOWL] },
  { id: 'kachumber', name: 'Kachumber salad', aliases: ['salad', 'cucumber onion salad'], group: 'side', ing: [[I.cucumber, 100], [I.tomato, 60], [I.onion, 40], [I.lemon, 5]], yield: 205, portions: [KATORI] },
  { id: 'raita', name: 'Cucumber raita', aliases: ['raita', 'kheera raita'], group: 'side', ing: [[I.curd, 150], [I.cucumber, 50]], yield: 200, portions: [KATORI] },
  { id: 'boondi-raita', name: 'Boondi raita', aliases: [], group: 'side', ing: [[I.curd, 150], [I.besan, 15], [I.oil, 6]], yield: 170, portions: [KATORI] },

  // ── chicken, mutton, fish, eggs ──
  { id: 'chicken-curry', name: 'Chicken curry', aliases: ['murgh curry', 'chicken masala'], group: 'nonveg', ing: [[I.chicken, 500], [I.oil, 30], [I.onion, 150], [I.tomato, 150], [I.ginger, 10], [I.garlic, 10], [I.curd, 50]], yield: 750, portions: [KATORI, BOWL], note: 'Boneless chicken; bone-in pieces carry less meat per katori.' },
  { id: 'butter-chicken', name: 'Butter chicken', aliases: ['murgh makhani', 'chicken makhani'], group: 'nonveg', ing: [[I.chicken, 500], [I.butter, 30], [I.cream, 60], [I.tomato, 200], [I.onion, 50], [I.cashew, 20], [I.curd, 50]], yield: 800, portions: [KATORI, BOWL] },
  { id: 'tandoori-chicken', name: 'Tandoori chicken', aliases: [], group: 'nonveg', ing: [[I.chicken, 300], [I.curd, 50], [I.oil, 10], [I.lemon, 10]], yield: 260, portions: [['serving', 150], ['piece', 90]], note: 'Meat only; weigh without the bone.' },
  { id: 'chicken-65', name: 'Chicken 65', aliases: ['chicken sixty five', 'fried chicken indian'], group: 'nonveg', ing: [[I.chicken, 300], [I.oil, 30], [I.curd, 20], [I.maida, 15]], yield: 280, portions: [['serving', 150], ['piece', 25]], note: 'Includes the oil a deep-fried batch absorbs; cornflour is modelled as maida.' },
  { id: 'chicken-tikka', name: 'Chicken tikka', aliases: ['tikka'], group: 'nonveg', ing: [[I.chicken, 300], [I.curd, 60], [I.oil, 10]], yield: 260, portions: [['serving', 150], ['piece', 25]] },
  { id: 'chicken-keema', name: 'Chicken keema', aliases: ['chicken mince'], group: 'nonveg', ing: [[I.chicken, 300], [I.oil, 15], [I.onion, 80], [I.tomato, 80], [I.peas, 50]], yield: 420, portions: [KATORI] },
  { id: 'mutton-curry', name: 'Mutton curry', aliases: ['gosht', 'goat curry', 'mutton masala', 'rogan josh'], group: 'nonveg', ing: [[I.goat, 500], [I.oil, 30], [I.onion, 150], [I.tomato, 120], [I.curd, 60], [I.ginger, 10], [I.garlic, 10]], yield: 700, portions: [KATORI, BOWL], note: 'Boneless goat meat.' },
  { id: 'mutton-keema', name: 'Mutton keema', aliases: ['keema matar', 'qeema'], group: 'nonveg', ing: [[I.goat, 300], [I.oil, 15], [I.onion, 80], [I.tomato, 80], [I.peas, 50]], yield: 420, portions: [KATORI] },
  { id: 'fish-curry', name: 'Fish curry (rohu)', aliases: ['machher jhol', 'macher jhol', 'rohu curry', 'fish masala'], group: 'nonveg', ing: [[I.fish, 400], [I.mustardOil, 25], [I.onion, 60], [I.tomato, 100]], yield: 550, portions: [KATORI, BOWL], note: 'Rohu is not in the USDA data; carp, its close relative, stands in.' },
  { id: 'coconut-fish-curry', name: 'Coconut fish curry', aliases: ['goan fish curry', 'meen curry'], group: 'nonveg', ing: [[I.fish, 400], [I.coconut, 80], [I.oil, 15], [I.tamarind, 10], [I.onion, 50]], yield: 650, portions: [KATORI, BOWL] },
  { id: 'fish-fry', name: 'Fish fry', aliases: ['tawa fish', 'fried fish'], group: 'nonveg', ing: [[I.fish, 200], [I.oil, 15], [I.besan, 10]], yield: 180, portions: [['piece', 60]] },
  { id: 'prawn-curry', name: 'Prawn curry', aliases: ['jhinga curry', 'shrimp curry'], group: 'nonveg', ing: [[I.shrimp, 300], [I.coconut, 60], [I.oil, 15], [I.onion, 60], [I.tomato, 60]], yield: 450, portions: [KATORI, BOWL] },
  { id: 'egg-curry', name: 'Egg curry', aliases: ['anda curry'], group: 'nonveg', ing: [[I.egg, 300], [I.oil, 20], [I.onion, 100], [I.tomato, 120]], yield: 500, portions: [KATORI, ['2 eggs with gravy', 170]] },
  { id: 'egg-bhurji', name: 'Egg bhurji', aliases: ['anda bhurji', 'scrambled eggs indian'], group: 'nonveg', ing: [[I.egg, 150], [I.oil, 10], [I.onion, 30], [I.tomato, 30], [I.chili, 5]], yield: 200, portions: [KATORI] },
  { id: 'masala-omelette', name: 'Masala omelette', aliases: ['omelette', 'omelet'], group: 'nonveg', ing: [[I.egg, 100], [I.oil, 6], [I.onion, 15], [I.tomato, 10]], yield: 125, portions: [['2-egg omelette', 125]] },
  { id: 'egg-roll', name: 'Egg roll', aliases: ['kathi roll', 'anda roll', 'egg paratha roll'], group: 'nonveg', ing: [[I.maida, 60], [I.oil, 12], [I.egg, 50], [I.onion, 20]], yield: 150, portions: [['roll', 150]] },

  // ── snacks and street food ──
  { id: 'samosa', name: 'Samosa', aliases: ['samosa aloo'], group: 'snack', ing: [[I.maida, 25], [I.oil, 15], [I.potato, 50], [I.peas, 8]], yield: 90, portions: [['samosa', 90]], note: 'Includes the oil a deep-fried samosa absorbs.' },
  { id: 'onion-pakora', name: 'Onion pakora', aliases: ['pakoda', 'bhajji', 'kanda bhaji', 'pyaz pakora'], group: 'snack', ing: [[I.besan, 40], [I.onion, 60], [I.oil, 20]], yield: 110, portions: [['plate', 110], ['piece', 20]] },
  { id: 'vada-pav', name: 'Vada pav', aliases: [], group: 'snack', ing: [[I.pav, 50], [I.potato, 70], [I.besan, 15], [I.oil, 12]], yield: 140, portions: [['vada pav', 140]] },
  { id: 'pav-bhaji', name: 'Pav bhaji (bhaji only)', aliases: ['bhaji'], group: 'snack', ing: [[I.potato, 150], [I.cauli, 60], [I.peas, 50], [I.capsicum, 40], [I.tomato, 120], [I.onion, 60], [I.butter, 25]], yield: 450, portions: [KATORI], note: 'Log the pav separately.' },
  { id: 'kachori', name: 'Kachori', aliases: ['moong dal kachori'], group: 'snack', ing: [[I.maida, 30], [I.moong, 10], [I.oil, 12]], yield: 60, portions: [['kachori', 60]] },
  { id: 'aloo-tikki', name: 'Aloo tikki', aliases: ['potato patty', 'tikki'], group: 'snack', ing: [[I.potato, 120], [I.oil, 10], [I.besan, 5]], yield: 120, portions: [['tikki', 60]] },
  { id: 'bhel-puri', name: 'Bhel puri', aliases: ['bhel', 'jhal muri', 'churmuri'], group: 'snack', ing: [[I.puffedRice, 30], [I.potato, 30], [I.onion, 20], [I.tomato, 20], [I.peanuts, 10], [I.tamarind, 5], [I.jaggery, 8], [I.besan, 10], [I.oil, 5]], yield: 140, portions: [['plate', 140]], note: 'Sev is modelled as besan fried in a little oil.' },
  { id: 'pani-puri', name: 'Pani puri', aliases: ['golgappa', 'gol gappe', 'puchka', 'phuchka'], group: 'snack', ing: [[I.sooji, 15], [I.oil, 8], [I.potato, 40], [I.chana, 10], [I.tamarind, 5], [I.jaggery, 5]], yield: 200, portions: [['plate of 6', 200]], note: 'Most of the weight is the spiced water.' },
  { id: 'dahi-vada', name: 'Dahi vada', aliases: ['dahi bhalla', 'thayir vadai'], group: 'snack', ing: [[I.urad, 30], [I.oil, 10], [I.curd, 120], [I.sugar, 5]], yield: 200, portions: [['plate of 2', 200]], note: 'Includes the oil the fried vadas absorb.' },

  // ── sweets ──
  { id: 'gulab-jamun', name: 'Gulab jamun', aliases: [], group: 'sweet', ing: [[I.maida, 10], [I.milk, 60], [I.sugar, 25], [I.oil, 8]], yield: 60, portions: [['piece', 30]], note: 'Rough estimate: khoya is modelled as reduced whole milk.' },
  { id: 'kheer', name: 'Rice kheer', aliases: ['payasam', 'kheer'], group: 'sweet', ing: [[I.milk, 500], [I.rice, 30], [I.sugar, 40], [I.cashew, 10]], yield: 380, portions: [KATORI] },
  { id: 'sooji-halwa', name: 'Sooji halwa', aliases: ['rava kesari', 'sheera', 'suji halwa'], group: 'sweet', ing: [[I.sooji, 50], [I.ghee, 30], [I.sugar, 50], [I.cashew, 5]], yield: 200, portions: [['katori', 100]] },
  { id: 'gajar-halwa', name: 'Gajar halwa', aliases: ['carrot halwa'], group: 'sweet', ing: [[I.carrot, 300], [I.milk, 300], [I.sugar, 50], [I.ghee, 25]], yield: 330, portions: [['katori', 100]] },
  { id: 'rasgulla', name: 'Rasgulla', aliases: ['rosogolla'], group: 'sweet', ing: [[I.paneer, 50], [I.sugar, 35]], yield: 120, portions: [['piece', 30]], note: 'Rough estimate: chhena is modelled with the paneer values, plus the syrup it soaks up.' },
  { id: 'besan-ladoo', name: 'Besan ladoo', aliases: ['laddu', 'ladoo'], group: 'sweet', ing: [[I.besan, 50], [I.ghee, 25], [I.sugar, 40]], yield: 115, portions: [['ladoo', 35]] },
  { id: 'jalebi', name: 'Jalebi', aliases: [], group: 'sweet', ing: [[I.maida, 40], [I.oil, 15], [I.sugar, 50]], yield: 100, portions: [['piece', 25]] },
  { id: 'peanut-chikki', name: 'Peanut chikki', aliases: ['chikki', 'gur patti', 'groundnut brittle'], group: 'sweet', ing: [[I.peanuts, 50], [I.jaggery, 40]], yield: 85, portions: [['piece', 20]] },

  // ── drinks ──
  { id: 'masala-chai', name: 'Chai with milk and sugar', aliases: ['masala chai', 'tea with milk', 'cutting chai'], group: 'drink', ing: [[I.milk, 60], [I.sugar, 8], [I.tea, 90]], yield: 150, portions: [CUP, ['cutting', 80]] },
  { id: 'filter-coffee', name: 'Filter coffee', aliases: ['kaapi', 'coffee with milk'], group: 'drink', ing: [[I.milk, 100], [I.sugar, 8], [I.coffee, 50]], yield: 150, portions: [CUP] },
  { id: 'sweet-lassi', name: 'Sweet lassi', aliases: ['lassi'], group: 'drink', ing: [[I.curd, 200], [I.sugar, 20], [I.milk, 50]], yield: 270, portions: [GLASS] },
  { id: 'chaas', name: 'Chaas (buttermilk)', aliases: ['buttermilk', 'salted lassi', 'mattha', 'majjige'], group: 'drink', ing: [[I.curd, 150]], yield: 300, portions: [GLASS] },
  { id: 'mango-lassi', name: 'Mango lassi', aliases: [], group: 'drink', ing: [[I.curd, 150], [I.mango, 100], [I.sugar, 15]], yield: 265, portions: [GLASS] },
  { id: 'badam-milk', name: 'Badam milk', aliases: ['almond milk indian'], group: 'drink', ing: [[I.milk, 250], [I.almonds, 15], [I.sugar, 15]], yield: 280, portions: [GLASS] },
  { id: 'nimbu-pani', name: 'Nimbu pani', aliases: ['lemonade', 'shikanji'], group: 'drink', ing: [[I.lemon, 20], [I.sugar, 15]], yield: 250, portions: [GLASS] },
  { id: 'sattu-drink', name: 'Sattu drink', aliases: ['sattu sharbat', 'sattu'], group: 'drink', ing: [[I.besan, 30], [I.lemon, 5]], yield: 250, portions: [GLASS], note: 'Sattu is roasted gram flour; besan, the same flour unroasted, stands in.' },
]
