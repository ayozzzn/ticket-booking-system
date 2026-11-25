
export type Venue = {
  id: number;
  name: string;
  address: string;
  category: "Theatre" | "Stadium" | "Sports Arena";
};

export const venues: Venue[] = [
  {
    id: 1,
    name: "Abay Opera House",
    address: "110 Kabanbay Batyr Street, Almaty",
    category: "Theatre",
  },
  {
    id: 2,
    name: "Auezov Kazakh Drama Theatre",
    address: "103 Abay Avenue, Almaty",
    category: "Theatre",
  },
  {
    id: 3,
    name: "Lermontov Russian Drama Theatre",
    address: "43 Abay Avenue, Almaty",
    category: "Theatre",
  },
  {
    id: 4,
    name: "Almaty Theatre",
    address: "30 Al-Farabi Avenue, Almaty",
    category: "Theatre",
  },
  {
    id: 5,
    name: "Gabit Musrepov Theatre",
    address: "38 Abylai Khan Avenue, Almaty",
    category: "Theatre",
  },
  {
    id: 6,
    name: "Almaty Central Stadium",
    address: "29/3 Satpayev Street, Almaty",
    category: "Stadium",
  },
  {
    id: 7,
    name: "Almaty Arena",
    address: "7 Nurkent Microdistrict, Almaty",
    category: "Sports Arena",
  },
  {
    id: 8,
    name: "Halyk Arena",
    address: "2D Kuldzhinsky Tract, Almaty",
    category: "Sports Arena",
  },
  {
    id: 9,
    name: "Baluan Sholak Sports Palace",
    address: "44 Abay Avenue, Almaty",
    category: "Sports Arena",
  },
  {
    id: 10,
    name: "Spartak Stadium",
    address: "1 Gogol Street, Almaty",
    category: "Stadium",
  },
];
