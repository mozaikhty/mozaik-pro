const fs = require('fs');

['search.js', 'profile.js'].forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    
    // Fix the literal \n issue in search.js
    if (code.includes('window.initVideoPlayers?.(); window.observeModalVideos?.();\\n    } catch(e) { console.error(e); }')) {
        code = code.replace(
            'window.initVideoPlayers?.(); window.observeModalVideos?.();\\n    } catch(e) { console.error(e); }',
            '        window.initVideoPlayers?.(); window.observeModalVideos?.();\n    } catch(e) { console.error(e); }'
        );
        fs.writeFileSync(file, code, 'utf8');
        console.log('Fixed newline in ' + file);
    }
    
    // If not found in profile.js, let's find the end of openPostDetail
    if (!code.includes('observeModalVideos')) {
        let lines = code.split('\n');
        let idx = lines.findIndex(l => l.includes('window.openPostDetail'));
        let found = false;
        if (idx !== -1) {
            for (let i = idx; i < lines.length; i++) {
                if (lines[i].includes('} catch(e) { console.error(e); }') || lines[i].includes('} catch (e) { console.error(e); }')) {
                    lines.splice(i, 0, '        window.initVideoPlayers?.(); window.observeModalVideos?.();');
                    found = true;
                    break;
                }
            }
        }
        if (found) {
            fs.writeFileSync(file, lines.join('\n'), 'utf8');
            console.log('Added to ' + file);
        } else {
            console.log('Could not find catch block in ' + file);
        }
    }
});
