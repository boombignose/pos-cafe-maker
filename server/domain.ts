import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const deriveKey = promisify(scrypt);
export const roleSchema = z.enum(['owner', 'cashier', 'bar']);
export const passwordSchema = z.string().min(12).max(128).refine(value => !/^(password|admin|owner|cashier|welcome|qwerty|123456|letmein|boombignose)/i.test(value) && !/^(.)\1+$/.test(value) && !/^\d+$/.test(value), 'Use a unique password of at least 12 characters');
export const nameSchema = z.string().trim().min(1).max(160);
export const usernameSchema = z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/).transform(value => value.toLowerCase());
export const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
export const moneySchema = z.number().int().min(0).max(1_000_000_000);
export const recipeSchema = z.array(z.object({ingredientId:z.string().min(1).max(100),quantity:decimalSchema}).strict()).max(100);
export const optionSchema = z.object({id:z.string().min(1).max(100),group:nameSchema,name:nameSchema,priceSatang:moneySchema,recipe:recipeSchema}).strict();
export const menuSchema = z.object({name:nameSchema,category:nameSchema,priceSatang:moneySchema,active:z.boolean(),recipe:recipeSchema,options:z.array(optionSchema).max(100)}).strict().refine(menu=>new Set(menu.options.map(o=>o.id)).size===menu.options.length,'Option IDs must be unique');
export const checkoutSchema = z.object({items:z.array(z.object({menuId:z.string().min(1).max(100),quantity:z.number().int().min(1).max(100),optionIds:z.array(z.string().min(1).max(100)).max(100)}).strict()).min(1).max(100),paymentMethod:z.enum(['cash','transfer']),amountTenderedSatang:moneySchema,idempotencyKey:z.string().min(8).max(128),transferConfirmed:z.boolean()}).strict();
export type Recipe = z.infer<typeof recipeSchema>;
export type Menu = z.infer<typeof menuSchema> & {id:string};
export type Checkout = z.infer<typeof checkoutSchema>;
export class ApiError extends Error {
  constructor(public status:number, public code:string, message:string) {super(message);}
}
export function requireCondition(condition:unknown, status:number, code:string, message:string): asserts condition {
  if (!condition) throw new ApiError(status,code,message);
}
export function canonicalHash(value:unknown):string {
  const canonical = (input:unknown):unknown => Array.isArray(input) ? input.map(canonical) : input && typeof input==='object' ? Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,val])=>[key,canonical(val)])) : input;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password:string):Promise<string> {
  const salt=randomBytes(16).toString('hex');
  const key=await deriveKey(password,salt,64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password:string, stored:string):Promise<boolean> {
  const [scheme,salt,key]=stored.split(':');
  if(scheme!=='scrypt'||!salt||!key) return false;
  const expected=Buffer.from(key,'hex');
  const actual=await deriveKey(password,salt,64) as Buffer;
  return expected.length===actual.length && timingSafeEqual(expected,actual);
}
export function csvCell(value:unknown):string {
  let text=String(value ?? '');
  if (/^[\s]*[=+\-@]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
