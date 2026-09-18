/**
 * Sous-préfectures de Côte d'Ivoire, regroupées par région administrative.
 * Source unique pour les formulaires « Établissement » (liste déroulante recherchable).
 */
export interface SubPrefecture {
  name: string;
  region: string;
}

const BY_REGION: Record<string, string[]> = {
  "Abidjan": [
    "Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Brofodoumé", "Cocody",
    "Koumassi", "Marcory", "Plateau", "Port-Bouët", "Songon", "Treichville", "Yopougon",
  ],
  "Agnéby-Tiassa": [
    "Agboville", "Aboudé", "Attobrou", "Azaguié", "Céchi", "Grand-Morié", "Guessiguié",
    "Loviguié", "Oress-Krobou", "Rubino", "Sikensi", "Gomon", "Taabo", "Tiassalé", "N'Douci", "Pacobo",
  ],
  "Bafing": [
    "Touba", "Booko", "Borotou", "Guintéguéla", "Koro", "Ouaninou", "Gbélo", "Kimbirila-Sud", "Koonan", "Santa",
  ],
  "Bagoué": [
    "Boundiali", "Baya", "Ganaoni", "Kasséré", "Siempurgo", "Gbon", "Kolia", "Kouto",
    "Sianhala", "Blességué", "Tengréla", "Débété", "Kanakono", "Papara",
  ],
  "Bélier": [
    "Yamoussoukro", "Attiégouakro", "Kossou", "Didiévi", "Boli", "Molonou", "Raviart",
    "Tié-N'Diékro", "Djékanou", "Tiébissou", "Lomokankro", "Molonoublé", "Yakpabo-Sakassou",
  ],
  "Béré": [
    "Mankono", "Bouandougou", "Kongasso", "Marandallah", "Sarhala", "Tiéningboué",
    "Dianra", "Dianra-Village", "Kounahiri", "Kongasso-Village",
  ],
  "Bounkani": [
    "Bouna", "Bouko", "Ondéfidouo", "Youndouo", "Doropo", "Danoa", "Kalamon", "Niandégué",
    "Nassian", "Kakpin", "Kotouba", "Sominassé", "Téhini", "Gogo", "Tougbo",
  ],
  "Cavally": [
    "Guiglo", "Bédy-Goazon", "Kaadé", "Nizahon", "Bloléquin", "Diboké", "Doké", "Tinhou",
    "Toulépleu", "Bakoubly", "Méo", "Nézobly", "Péhé", "Taï", "Zagné",
  ],
  "Folon": [
    "Minignan", "Kimbirila-Nord", "Sokoro", "Tienko", "Goulia", "Kaniasso", "Mahandiana-Sokourani",
  ],
  "Gbêkê": [
    "Bouaké", "Brobo", "Djébonoua", "Bounda", "Diabo", "Kanawolo", "Botro", "Diabo-Village",
    "Languibonou", "Sakassou", "Ayaou-Sran", "Toumodi-Sakassou", "Béoumi", "Ando-Kékrénou",
    "Bodokro", "Kondrobo", "Lolobo", "Marabadiassa", "N'Guessankro",
  ],
  "Gbôklé": [
    "Sassandra", "Dakpadou", "Gribouo", "Lobakuya", "Médon", "Fresco", "Dahiri", "Gbagbam",
  ],
  "Gôh": [
    "Gagnoa", "Bayota", "Dignago", "Doukouya", "Gnagbodougnoa", "Guibéroua", "Ouragahio",
    "Serihio", "Yopohué", "Oumé", "Diégonéfla", "Guépahouo", "Tonla",
  ],
  "Grands-Ponts": [
    "Dabou", "Lopou", "Toupah", "Jacqueville", "Attoutou", "Grand-Lahou", "Ahouanou",
    "Bacanda", "Ebonou", "Toukouzou",
  ],
  "Guémon": [
    "Duékoué", "Bagohouo", "Guéhiébly", "Bangolo", "Béoué-Zibiao", "Blénimeouin", "Diéouzon",
    "Fongouli", "Gohouo-Zagna", "Kahin-Zarabaon", "Zéo", "Zou", "Facobly", "Guézon", "Koua", "Sémien",
  ],
  "Hambol": [
    "Katiola", "Fronan", "Timbé", "Dabakala", "Bassawa", "Boniérédougou", "Foumbolo",
    "Satama-Sokoura", "Satama-Sokoro", "Sokala-Sobara", "Tendéné-Bambarasso", "Yaossédougou",
    "Niakaramandougou", "Arikokaha", "Badikaha", "Niédiékaha", "Tafiré", "Tortiya",
  ],
  "Haut-Sassandra": [
    "Daloa", "Bédiala", "Gadouan", "Gboguhé", "Gonaté", "Zaïbo", "Issia", "Boguédia",
    "Iboguhé", "Namané", "Nahio", "Saïoua", "Tapéguia", "Vavoua", "Bazré", "Dania", "Kétro-Bassam",
    "Séitifla", "Zoukougbeu", "Domangbeu", "Grébouo", "Guessabo",
  ],
  "Iffou": [
    "Daoukro", "Ananda", "Ettrokro", "Kouassi-Kouassikro", "Samanza", "M'Bahiakro",
    "Bonguéra", "Kondrobo", "Sahibo-Nord", "Prikro", "Anianou", "Famienkro", "Koffi-Amonkro", "Nafana",
  ],
  "Indénié-Djuablin": [
    "Abengourou", "Amélékia", "Aniassué", "Ebilassokro", "Niablé", "Yakassé-Féyassé",
    "Zaranou", "Agnibilékrou", "Akoboissué", "Damé", "Tanguélan", "Bettié", "Diamarakro", "Kouassi-Datékro",
  ],
  "Kabadougou": [
    "Odienné", "Bako", "Bougousso", "Dioulatiédougou", "Tiémé", "Bougou", "Gbéléban",
    "Samango", "Séguélon", "Kaniasso", "Madinani", "Fengolo", "N'Goloblasso", "Séydougou",
  ],
  "La Mé": [
    "Adzopé", "Agou", "Annépé", "Assikoi", "Bécédi-Brignan", "Yakassé-Mé", "Akoupé",
    "Afféry", "Bécouéfin", "Alépé", "Aboisso-Comoé", "Allosso", "Danguira", "Oghlwapo", "Yakassé-Attobrou",
    "Biéby", "Bringakro",
  ],
  "Lôh-Djiboua": [
    "Divo", "Chiépo", "Didoko", "Hiré", "Nébo", "Ogoudou", "Zégo", "Guitry", "Dairo-Didizo",
    "Lauzoua", "Yocoboué", "Lakota", "Djidji", "Gagoré", "Goudouko", "Niambézaria", "Zikisso",
  ],
  "Marahoué": [
    "Bouaflé", "Bégbessou", "Bonon", "N'Douffoukankro", "Pakouabo", "Zaguiéta",
    "Sinfra", "Bazré-Sinfra", "Kononfla", "Kouétinfla", "Zuénoula", "Gohitafla", "Iriéfla",
    "Kanzra", "Maminigui", "Vouéboufla",
  ],
  "Moronou": [
    "Bongouanou", "Andé", "Assié-Koumassi", "N'Guessankro", "Arrah", "Kotobi", "Krégbé",
    "M'Batto", "Anoumaba", "Assahara", "Tiémélékro",
  ],
  "Nawa": [
    "Soubré", "Grand-Zattry", "Liliyo", "Okrouyo", "Buyo", "Dabakala-Nawa", "Guéyo",
    "Dagbégo", "Méagui", "Gnamangui", "Oupoyo", "Kpéaba",
  ],
  "N'Zi": [
    "Dimbokro", "Abigui", "Diangokro", "Nofou", "Bocanda", "Bengassou", "Kouadioblékro",
    "N'Zècrèzessou", "Kpangbassou", "Kouassi-Kouassikro-N'Zi",
  ],
  "Poro": [
    "Korhogo", "Dikodougou", "Guiembé", "Kanoroba", "Karakoro", "Kiémou", "Komborodougou",
    "Koni", "Kombolokoura", "Lataha", "Nafoun", "N'Ganon", "Niofoin", "Sirasso", "Sohouo",
    "Tioroniaradougou", "M'Bengué", "Bougou-M'Bengué", "Katiali", "Sinématiali", "Sédiogo",
    "Baya-Poro",
  ],
  "San-Pédro": [
    "San-Pédro", "Dogbo", "Doba", "Gabiadji", "Grand-Béréby", "Dapo-Iboké", "Nero-Mer",
    "Tabou", "Dapo", "Djamandioké", "Djouroutou", "Grabo", "Olodio",
  ],
  "Sud-Comoé": [
    "Aboisso", "Adaou", "Adjouan", "Ayamé", "Bianouan", "Kouakro", "Maféré", "Yaou",
    "Adiaké", "Assinie-Mafia", "Étuéboué", "Grand-Bassam", "Bongo", "Bonoua", "Tiapoum",
    "Nouamou", "Noé",
  ],
  "Tchologo": [
    "Ferkessédougou", "Koumbala", "Togoniéré", "Kong", "Bilimono", "Nafana-Kong", "Sikolo",
    "Ouangolodougou", "Diawala", "Kaouara", "Niellé", "Toumoukoro",
  ],
  "Tonkpi": [
    "Man", "Bogouiné", "Sandougou-Soba", "Podiagouiné", "Danané", "Daleu", "Gbon-Houyé",
    "Kouan-Houlé", "Mahapleu", "Seileu", "Zonneu", "Biankouma", "Blapleu", "Gbangbégouiné",
    "Gouiné", "Kpata", "Santa-Biankouma", "Sipilou", "Yorodougou", "Logoualé", "Sangouiné",
    "Zouan-Hounien", "Banneu", "Bin-Houyé", "Goulaleu", "Téapleu",
  ],
  "Worodougou": [
    "Séguéla", "Bobi", "Diarabana", "Dualla", "Kamalo", "Massala", "Sifié", "Worofla",
    "Kani", "Djibrosso", "Fadiadougou", "Morondo",
  ],
  Yamoussoukro: ["Yamoussoukro", "Attiégouakro", "Kossou", "Lolobo-Yamoussoukro"],
  "Zanzan / Gontougo": [
    "Bondoukou", "Appimandoum", "Bondo", "Gbekonfoum", "Kouassi-Niaguini", "Laoudi-Ba",
    "Sorobango", "Taoudi", "Yézimala", "Tanda", "Amanvi", "Diamba", "N'Dénou", "Koun-Fao",
    "Kokomian", "Tankessé", "Tienkoikro", "Transua", "Assuéfry", "Kouassi-Datékro-Gontougo",
    "Sandégué", "Bandakagni-Tomora", "Dimandougou",
  ],
};

export const SUB_PREFECTURES: SubPrefecture[] = Object.entries(BY_REGION)
  .flatMap(([region, names]) => names.map((name) => ({ name, region })))
  .filter((v, i, arr) => arr.findIndex((x) => x.name === v.name) === i)
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

export const SUB_PREFECTURE_NAMES = SUB_PREFECTURES.map((s) => s.name);

export const regionForSubPrefecture = (name: string): string =>
  SUB_PREFECTURES.find((s) => s.name === name)?.region ?? "";

export default SUB_PREFECTURES;
