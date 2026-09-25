const fs = require('fs');
let s = fs.readFileSync('feed.js', 'utf8');

const target = /const uploadTaskPromise = uploadBytes\(storageRef, file, \{ contentType: cType \}\);/g;

const replacement = `
                        btn.innerText = "Video hazırlanıyor...";
                        // iOS Safari'nin File objesini okuyamama (storage/unknown) bug'ını aşmak için
                        // dosyayı zorla RAM'e çekip yepyeni, temiz bir Blob oluşturuyoruz.
                        file.arrayBuffer().then(buffer => {
                            const cleanBlob = new Blob([buffer], { type: cType });
                            const uploadTaskPromise = uploadBytes(storageRef, cleanBlob, { contentType: cType });
                            btn.innerText = "Yükleniyor... (Mobil optimize)";
                            uploadTaskPromise.then(() => resolve()).catch((err) => reject(err));
                        }).catch(bufferErr => {
                            reject({ code: 'local/buffer_error', message: 'Dosya okunamadı (iCloud veya format hatası): ' + bufferErr.message });
                        });
`;

s = s.replace(target, replacement);
fs.writeFileSync('feed.js', s, 'utf8');
console.log("Added ArrayBuffer Blob reconstruction to bypass Safari bug");
