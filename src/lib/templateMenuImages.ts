import blackPepperBeefBowl from '../assets/demo-menu/black-pepper-beef-bowl.webp';
import caramelBananaRoll from '../assets/demo-menu/caramel-banana-roll.webp';
import charredChickenNoodles from '../assets/demo-menu/charred-chicken-noodles.webp';
import crispyChickenDumplings from '../assets/demo-menu/crispy-chicken-dumplings.webp';
import emberTeriyakiChickenBowl from '../assets/demo-menu/ember-teriyaki-chicken-bowl.webp';
import gardenSpringRolls from '../assets/demo-menu/garden-spring-rolls.webp';
import garlicVegetableFriedRice from '../assets/demo-menu/garlic-vegetable-fried-rice.webp';
import honeyLemonIcedTea from '../assets/demo-menu/honey-lemon-iced-tea.webp';
import kungPaoChicken from '../assets/demo-menu/kung-pao-chicken.webp';
import sichuanTofu from '../assets/demo-menu/sichuan-tofu.webp';
import garlicGingerPrawns from '../assets/ember-wok-editorial-hero.webp';
import sesameMarketGreens from '../assets/ember-wok-featured-vegetables.webp';

const demoImageByEnglishName: Record<string, string> = {
  'Crispy Chicken Dumplings': crispyChickenDumplings,
  'Garden Spring Rolls': gardenSpringRolls,
  'Ember Teriyaki Chicken Bowl': emberTeriyakiChickenBowl,
  'Black Pepper Beef Bowl': blackPepperBeefBowl,
  'Kung Pao Chicken': kungPaoChicken,
  'Garlic Ginger Prawns': garlicGingerPrawns,
  'Charred Chicken Noodles': charredChickenNoodles,
  'Garlic Vegetable Fried Rice': garlicVegetableFriedRice,
  'Sichuan Tofu': sichuanTofu,
  'Sesame Market Greens': sesameMarketGreens,
  'Honey Lemon Iced Tea': honeyLemonIcedTea,
  'Caramel Banana Roll': caramelBananaRoll,
};

/**
 * Template-only visuals keep an empty database image_url visibly useful.
 * A merchant-provided URL always takes precedence and does not need migration.
 */
export function getMenuDisplayImage(imageUrl?: string | null, nameEn?: string | null) {
  return imageUrl?.trim() || (nameEn ? demoImageByEnglishName[nameEn] : undefined);
}
