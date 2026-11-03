-- Report-Funnel: Cover-Bild (JPG/PNG) für die WhatsApp-Vorlage report_versand_bild im selben Bucket
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'sales-reports';
