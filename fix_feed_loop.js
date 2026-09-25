const fs = require('fs');

let s = fs.readFileSync('feed.js', 'utf8');

const startIndex = s.indexOf('for (let rawFile of files) {');
const endIndex = s.indexOf('let imageUrl = mediaArray.length > 0 ? mediaArray[0].url : null;');

const cleanCode = `for (let rawFile of files) {
                console.log("=== RAW FILE ===", { name: rawFile?.name, type: rawFile?.type, size: rawFile?.size });

                let file = rawFile;
                let isVideo = (file.type || '').startsWith('video/');
                if (!isVideo && file.name && (file.name.toLowerCase().endsWith('.mp4') || file.name.toLowerCase().endsWith('.mov'))) {
                    isVideo = true;
                }

                if (!isVideo) {
                    file = await window.compressImage(rawFile, 1200, 1200, 0.75, 800 * 1024); 
                }

                console.log("=== UPLOAD FILE ===", { name: file?.name, type: file?.type, size: file?.size });

                const safeName = (file.name || 'video.mp4').replace(/[^a-zA-Z0-9.]/g, "");
                const fileName = \`posts/\${auth.currentUser.uid}_\${Date.now()}_\${safeName}\`;
                
                const storageRef = ref(storage, fileName);
                
                try {
                    await new Promise((resolve, reject) => {
                        const cType = file.type || (isVideo ? 'video/mp4' : 'image/jpeg');
                        const uploadTask = uploadBytesResumable(storageRef, file, { contentType: cType });
                        uploadTask.on('state_changed', 
                            (snapshot) => {
                                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                btn.innerText = "Yükleniyor... %" + Math.round(progress);
                            },
                            (error) => reject(error),
                            () => resolve()
                        );
                    });
                    const url = await getDownloadURL(storageRef);
                    mediaArray.push({ url, type: isVideo ? 'video' : 'image', storagePath: fileName });
                } catch(innerErr) {
                    console.error("=== INNER UPLOAD ERROR ===", innerErr);
                    const debugStr = "HATA DETAYI:\\n" +
                                     "Code: " + innerErr?.code + "\\n" +
                                     "Msg: " + innerErr?.message + "\\n" +
                                     "SrvResp: " + innerErr?.serverResponse + "\\n" +
                                     "File: " + file?.name + " (" + file?.type + ") " + file?.size + " bytes";
                    alert(debugStr);
                    throw innerErr;
                }
            }
        }
        
        `;

s = s.substring(0, startIndex) + cleanCode + s.substring(endIndex);
fs.writeFileSync('feed.js', s, 'utf8');
console.log("Successfully cleaned up the upload loop!");
