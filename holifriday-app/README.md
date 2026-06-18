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
