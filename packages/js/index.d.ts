export interface Commune {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

export interface Daira {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_communes: number;
  communes: Commune[];
}

export interface Wilaya {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
  dairas: Daira[];
}

/** Flat wilaya record (from wilayas.json — no nested dairas). */
export interface WilayaFlat {
  wilaya_num: number;
  code: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_dairas: number;
  nb_communes: number;
}

/** Flat daïra record (from dairas.json). */
export interface DairaFlat {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_fr: string;
  wilaya_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  nb_communes: number;
}

/** Flat commune record (from communes.json — carries wilaya + daïra context). */
export interface CommuneFlat {
  wilaya_num: number;
  wilaya_code: string;
  wilaya_ar: string;
  wilaya_fr: string;
  wilaya_en: string;
  daira_ar: string;
  daira_fr: string;
  daira_en: string;
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_postal: string | null;
}

export interface Country {
  nom_ar: string;
  nom_fr: string;
  nom_en: string;
  code_iso: string;
}

export interface Algeria {
  pays: Country;
  langues: string[];
  nb_wilayas: number;
  nb_dairas: number;
  nb_communes: number;
  wilayas: Wilaya[];
  [key: string]: unknown;
}

export function getAll(): Algeria;
export function getWilayas(): WilayaFlat[];
export function getDairas(): DairaFlat[];
export function getCommunes(): CommuneFlat[];
export function byWilaya(num: number): Wilaya | undefined;
export function findByPostalCode(code: string): CommuneFlat[];
export function findCommune(query: string): CommuneFlat[];

declare const _default: {
  getAll: typeof getAll;
  getWilayas: typeof getWilayas;
  getDairas: typeof getDairas;
  getCommunes: typeof getCommunes;
  byWilaya: typeof byWilaya;
  findByPostalCode: typeof findByPostalCode;
  findCommune: typeof findCommune;
};
export default _default;
