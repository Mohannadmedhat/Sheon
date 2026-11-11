/**
 * =========================================================================
 * SHEON - كود ربط أوردرات الموقع بـ Google Sheets تلقائياً
 * =========================================================================
 * 
 * خطوات التفعيل في دقيقتين فقط:
 * 1. افتحي ملف Google Sheets جديد على حسابك في جوجل، وسميه: "SHEON - أوردرات الموقع"
 * 2. من القائمة العلوية اضغطي على: Extensions (الإضافات) > Apps Script
 * 3. امسحي أي كود موجود في النافذة، والصقي هذا الكود بالكامل مكانه.
 * 4. اضغطي على زر النشر الأزرق أعلى اليمين: Deploy > New deployment
 * 5. اضغطي على علامة الترس (Select type) واختاري: Web app
 * 6. اضبطي الخيارات كالتالي:
 *    - Description: SHEON Orders Webhook
 *    - Execute as: Me (حسابك الشخصي)
 *    - Who has access: Anyone (أي شخص)  <-- خطوة ضرورية جداً لاستقبال الطلبات بدون تسجيل دخول
 * 7. اضغطي Deploy ووافقي على الصلاحيات (Authorize access > Advanced > Go to ... (unsafe))
 * 8. انسخي الـ Web app URL الناتج (يبدأ بـ https://script.google.com/macros/s/...)
 * 9. الصقي الرابط في ملف index.html في خانة: GOOGLE_SHEETS_WEBAPP_URL
 * =========================================================================
 */

function sanitizeSheetText(value) {
  var str = String(value == null ? '' : value);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'active',
    message: 'SHEON Webhook is active and running successfully!'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var sheet = getOrCreateOrdersSheet();
    var data = {};
    
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        data = e.parameter || {};
      }
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    
    // إضافة صف جديد ببيانات الأوردر مع حماية الخلايا النصية من تفسيرات المعادلات
    sheet.appendRow([
      sanitizeSheetText(data.orderCode || 'SH-0000'),
      sanitizeSheetText(data.timestamp || new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })),
      sanitizeSheetText(data.customerName || ''),
      "'" + (data.phone || ''), // علامة ' لضمان بقاء صفر الموبايل على الشمال
      sanitizeSheetText(data.governorate || ''),
      sanitizeSheetText(data.address || ''),
      sanitizeSheetText(data.bundleName || ''),
      sanitizeSheetText(data.chosenColors || ''),
      sanitizeSheetText(data.paymentMethod || ''),
      Number(data.subtotal) || 0,
      Number(data.shipping) || 0,
      Number(data.total) || 0,
      sanitizeSheetText(data.notes || ''),
      sanitizeSheetText(data.status || 'جديد (قيد التأكيد)')
    ]);
    
    // محاذاة البيانات في المنتصف
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1, 1, 14).setVerticalAlignment("middle");
    
    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      orderCode: data.orderCode
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      result: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// دالة تنشئ شيت الأوردرات وتنسق الهيدر تلقائياً بألوان براند SHEON
function getOrCreateOrdersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("الأوردرات");
  
  if (!sheet) {
    var firstSheet = ss.getSheets()[0];
    if (firstSheet && firstSheet.getLastRow() === 0) {
      firstSheet.setName("الأوردرات");
      sheet = firstSheet;
    } else {
      sheet = ss.insertSheet("الأوردرات");
    }
    
    // عناوين الأعمدة التشغيلية
    var headers = [
      "كود الطلب",
      "التاريخ والوقت",
      "اسم العميل",
      "رقم الموبايل",
      "المحافظة",
      "العنوان بالتفصيل",
      "الباقة المختارة",
      "الألوان المختارة",
      "طريقة الدفع",
      "سعر الباقة (ج)",
      "مصاريف الشحن (ج)",
      "الإجمالي المستحق (ج)",
      "ملاحظات العميل",
      "حالة الطلب"
    ];
    
    sheet.appendRow(headers);
    
    // تنسيق الترويسة بلون البراند (برجندي راقي)
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#6A1A24");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 38);
    
    // اتجاه الشيت RTL ليكون مناسباً للغة العربية
    sheet.setRightToLeft(true);
    
    // تجميد الصف الأول
    sheet.setFrozenRows(1);
    
    // ضبط عروض الأعمدة لتكون مريحة للقراءة وفريق خدمة العملاء والشحن
    sheet.setColumnWidth(1, 110); // كود الطلب
    sheet.setColumnWidth(2, 160); // التاريخ
    sheet.setColumnWidth(3, 160); // الاسم
    sheet.setColumnWidth(4, 140); // الموبايل
    sheet.setColumnWidth(5, 140); // المحافظة
    sheet.setColumnWidth(6, 280); // العنوان
    sheet.setColumnWidth(7, 180); // الباقة
    sheet.setColumnWidth(8, 220); // الألوان
    sheet.setColumnWidth(9, 160); // طريقة الدفع
    sheet.setColumnWidth(10, 110); // السعر
    sheet.setColumnWidth(11, 110); // الشحن
    sheet.setColumnWidth(12, 130); // الإجمالي
    sheet.setColumnWidth(13, 220); // ملاحظات
    sheet.setColumnWidth(14, 160); // حالة الطلب
  }
  
  return sheet;
}

// دالة اختبارية لتجهيز الشيت بضغطة زر داخل محرر Apps Script
function testSetup() {
  getOrCreateOrdersSheet();
}
