export interface AdditionalWork {
  id: string;
  name: string;
  unit: 'piece' | 'm' | 'm2';
  quantity: number;
  unitPrice: number;
}
