# HOLIFRIDAY App

โปรเจกต์นี้เป็น React + Vite สำหรับทดลองใช้งาน HOLIFRIDAY ในเครื่องตัวเอง

## วิธีเปิดใช้งาน

1. ติดตั้ง Node.js ก่อน
2. เปิด Terminal / Command Prompt ในโฟลเดอร์นี้
3. รันคำสั่ง:

```bash
npm install
npm run dev
```

จากนั้นเปิดลิงก์ที่ขึ้นมา เช่น:

```text
http://localhost:5173
```

## วิธี build ก่อนลงเว็บ

```bash
npm run build
```

ไฟล์เว็บที่ build แล้วจะอยู่ในโฟลเดอร์ `dist`

## Deploy ขึ้น Vercel

เอาโฟลเดอร์นี้ขึ้น GitHub แล้ว Import เข้า Vercel ได้เลย

ค่าที่ใช้:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
```

## เก็บข้อมูลผู้สมัคร (User Signup)

โปรเจกต์นี้เพิ่มฟอร์มสมัครสมาชิกไว้แล้ว และจะบันทึกข้อมูลลง Supabase

ข้อมูลที่เก็บ:

- name
- email
- created_at

### 1) สร้างโปรเจกต์ Supabase

สร้างโปรเจกต์ใหม่ แล้วเปิด SQL Editor จากนั้นรัน SQL นี้:

```sql
create table if not exists public.user_signups (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	email text not null unique,
	created_at timestamptz not null default now()
);

alter table public.user_signups enable row level security;

create policy "allow public insert signups"
on public.user_signups
for insert
to anon
with check (true);

create policy "allow public read signups"
on public.user_signups
for select
to anon
using (true);
```

### 2) ตั้งค่า Environment Variables

คัดลอกไฟล์ `.env.example` เป็น `.env` แล้วใส่ค่า:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### 3) ตั้งค่าบน Vercel

ใน Project Settings > Environment Variables ใส่ 2 ตัวแปรนี้เหมือนใน `.env` แล้ว Redeploy

หลัง deploy แล้ว คนอื่นเข้าเว็บผ่านลิงก์ Vercel ได้ และข้อมูลผู้สมัครจะไปอยู่ในตาราง `user_signups`

## Sync Tasks ข้ามเครื่องด้วย Firebase Realtime Database

ตอนนี้โปรเจกต์รองรับการ sync board/tasks อัตโนมัติผ่าน Firebase แล้ว

- ถ้าตั้งค่า Firebase env ครบ: ข้อมูล tasks จะ sync ระหว่างผู้ใช้
- ถ้ายังไม่ตั้งค่า: ระบบจะ fallback ไป localStorage เหมือนเดิม

### 1) สร้าง Firebase Realtime Database

1. ไปที่ Firebase Console
2. สร้าง Project
3. เข้าเมนู Realtime Database และกด Create Database
4. เริ่มแบบ Test mode

### 2) ใส่ค่า Environment Variables

คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่า Firebase ดังนี้:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

อย่างน้อยต้องมี 3 ค่าแรกนี้เพื่อเปิดใช้งาน sync:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`

### 3) ตั้งค่าบน Vercel

เพิ่ม Environment Variables เดียวกันใน Vercel Project Settings และ Redeploy

เมื่อ deploy เสร็จ ผู้ใช้ทุกคนจะเห็น tasks ชุดเดียวกันจาก Firebase

### 4) Firebase Realtime Database Rules

ถ้าต้องการให้แอปอ่านได้เฉพาะผู้ที่ล็อกอิน ให้ใช้ rules ชุดเริ่มต้นนี้ก่อน:

```json
{
	"rules": {
		"holifriday": {
			"sharedBoards": {
				"main": {
					".read": "auth != null",
					".write": "auth != null"
				}
			}
		}
	}
}
```

ไฟล์ตัวอย่างอยู่ที่ [firebase.rules.json](firebase.rules.json).

หมายเหตุ: ด้วยโครงข้อมูลปัจจุบันที่เก็บ board/group เป็น array การบังคับ write แบบ owner/admin รายกลุ่มใน rules ล้วน ๆ ยังทำได้ไม่ครบ 100% ถ้าจะล็อกแบบละเอียดจริง ควรเปลี่ยน schema เป็น object keyed by id หรือใช้ custom claims เพิ่มเติม.
