// Nobetciyim/utils/cronJobs.js
const cron = require('node-cron');
const logger = require('./logger');
const {
    logCreditUpdate,
    determineActiveGuard,
    calculateCredit,
    updateActiveGuard
} = require('./cronHelpers');

class CronJobManager {
    constructor(db, calendarUtils, telegramBotHandler) {
        this.db = db;
        this.calendarUtils = calendarUtils;
        this.telegramBotHandler = telegramBotHandler;
        this.jobs = new Map();
    }

    /**
     * Dakikalık kredi güncelleme ve nöbetçi kontrol cron job'ı
     */
    setupCreditUpdateJob() {
        const job = cron.schedule('* * * * *', async () => {
            const now = new Date();
            try {
                // 1. Görevli nöbetçiyi belirle (izin kontrolü dahil)
                const { gorevliNobetci, gorevliKaynak, overrideTemizlendi, vardiya } = 
                    await determineActiveGuard(this.db, this.calendarUtils.getGorevliNobetci, now);

                if (!gorevliNobetci) {
                    logger.warn('[Kredi Cron] Görevli nöbetçi bulunamadı');
                    return;
                }

                // 2. Kaçırılan vardiya değişimlerini kontrol et
                await this.checkMissedShiftChanges();

                // 3. İzinli kişiye yanlışlıkla atama yapılmış mı kontrol et
                await this.checkAndFixIncorrectAssignment(now, gorevliNobetci, vardiya);

                // 4. Aktif nöbetçiyi güncelle
                await updateActiveGuard(
                    this.db, 
                    gorevliNobetci, 
                    gorevliKaynak, 
                    overrideTemizlendi, 
                    this.telegramBotHandler.notifyAllOfDutyChange
                );

                // 4. Kredi hesaplama ve güncelleme
                const tumKrediKurallari = await this.db.getAllKrediKurallari();
                const shiftTimeRanges = await this.db.getShiftTimeRanges();
                
                const { eklenecekKredi, krediSebebi } = await calculateCredit(
                    now, 
                    tumKrediKurallari, 
                    shiftTimeRanges
                );
                
                const yeniKredi = (gorevliNobetci.kredi || 0) + eklenecekKredi;
                await this.db.updateNobetciKredi(gorevliNobetci.id, yeniKredi);
                
                logCreditUpdate(
                    `[GÖREVLİ] ${gorevliNobetci.name} kredisi: ${yeniKredi} (+${eklenecekKredi} ${krediSebebi})`
                );
                
            } catch (error) {
                logger.error("[Kredi Cron] Hata:", error);
            }
        }, { 
            timezone: "Europe/Istanbul",
            scheduled: false 
        });

        this.jobs.set('creditUpdate', job);
        return job;
    }

    /**
     * İzinli kişiye yanlışlıkla atama yapılmış mı kontrol eder ve düzeltir
     */
    async checkAndFixIncorrectAssignment(now, currentGuard, vardiya) {
        try {
            // Mevcut aktif nöbetçiyi al
            const activeGuard = await this.db.getAktifNobetci();
            if (!activeGuard) return;

            // İzinli kayıtları kontrol et
            const izinler = await this.db.getIzinliNobetciVeYedekleri(now);
            const izinKaydi = izinler.find(iz => iz.nobetci_id === activeGuard.id);

            if (izinKaydi) {
                // Aktif nöbetçi izinli! Yedek atanmalı
                let yedekId = null;
                let vardiyaTipi = '';

                if (vardiya) {
                    const vardiyaAdi = vardiya.vardiya_adi ? vardiya.vardiya_adi.toLowerCase() : '';
                    if (vardiyaAdi.includes('gündüz') || 
                        (vardiya.baslangic_saat >= '09:00' && vardiya.baslangic_saat < '17:00')) {
                        yedekId = izinKaydi.gunduz_yedek_id;
                        vardiyaTipi = 'gündüz';
                    } else if (vardiyaAdi.includes('gece') || 
                               (vardiya.baslangic_saat >= '17:00' || vardiya.baslangic_saat < '09:00')) {
                        yedekId = izinKaydi.gece_yedek_id;
                        vardiyaTipi = 'gece';
                    }
                }

                if (yedekId) {
                    const yedekNobetci = await this.db.getNobetciById(yedekId);
                    if (yedekNobetci) {
                        await this.db.setAktifNobetci(yedekId);
                        logger.info(`[İzin Kontrolü] İzinli ${activeGuard.name} yerine ${vardiyaTipi} yedek ${yedekNobetci.name} atandı`);
                        
                        if (typeof this.telegramBotHandler.notifyAllOfDutyChange === 'function') {
                            await this.telegramBotHandler.notifyAllOfDutyChange(
                                yedekNobetci.name, 
                                `İzin Nedeniyle Yedek Atama (${vardiyaTipi})`
                            );
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('[İzin Kontrolü] Hata:', error);
        }
    }

    /**
     * Haftalık nöbetçi atama cron job'ı (Pazartesi 09:00)
     */
    setupWeeklyAssignmentJob() {
        const job = cron.schedule('0 9 * * 1', async () => {
            logger.info('[Haftalık Atama] Haftalık nöbetçi atama görevi başlatıldı.');
            try {
                const anlikTarih = new Date();
                logger.info(`[Haftalık Atama] Yeni hafta için nöbetçi aranıyor (Hedef Tarih: ${anlikTarih.toISOString()})`);
                
                // Override'ı temizle (yeni hafta başladığı için)
                await this.db.clearAktifNobetciOverride();
                logger.info('[Haftalık Atama] Manuel atama (override) temizlendi - yeni hafta başlangıcı');
                
                // Gerçek görevli nöbetçiyi bul
                const { nobetci: gercekGorevli } = await this.calendarUtils.getGorevliNobetci(anlikTarih);
                
                if (gercekGorevli && gercekGorevli.id) {
                    await this.db.setAktifNobetci(gercekGorevli.id);
                    logger.info(`[Haftalık Atama] Haftanın nöbetçisi başarıyla "${gercekGorevli.name}" olarak ayarlandı.`);
                    
                    if (typeof this.telegramBotHandler.notifyAllOfDutyChange === 'function') {
                        await this.telegramBotHandler.notifyAllOfDutyChange(gercekGorevli.name, 'Haftalık Otomatik Değişim');
                    }
                } else {
                    logger.warn("[Haftalık Atama] Bu hafta için görevli nöbetçi bulunamadı. Atama yapılamadı.");
                }
            } catch (error) {
                logger.error("[Haftalık Atama] Görev sırasında kritik bir hata oluştu:", error);
            }
        }, { 
            timezone: "Europe/Istanbul",
            scheduled: false 
        });

        this.jobs.set('weeklyAssignment', job);
        return job;
    }

    /**
     * Vardiya değişim cron job'ları kurma
     */
    async setupShiftChangeJobs() {
        try {
            const shiftTimeRanges = await this.db.getShiftTimeRanges();
            
            if (shiftTimeRanges && shiftTimeRanges.length > 0) {
                // Akşam vardiyası
                await this.setupEveningShiftJob(shiftTimeRanges);
                // Gündüz vardiyası
                await this.setupMorningShiftJob(shiftTimeRanges);
            }
        } catch (error) {
            logger.error("[Vardiya Kurulum] Vardiya cron job'ları kurulurken hata:", error);
        }
    }

    /**
     * Akşam vardiya cron job'ı
     */
    async setupEveningShiftJob(shiftTimeRanges) {
        const eveningShift = shiftTimeRanges.find(shift => 
            shift.baslangic_saat >= '17:00' || 
            (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('akşam')) ||
            (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('gece'))
        ) || shiftTimeRanges[1];

        if (!eveningShift) return;

        const [hour, minute] = eveningShift.baslangic_saat.split(':').map(Number);
        const cronTime = `${minute} ${hour} * * *`;
        
        const job = cron.schedule(cronTime, async () => {
            await this.handleShiftChange('Akşam Vardiya', eveningShift.baslangic_saat);
        }, { 
            timezone: "Europe/Istanbul",
            scheduled: false 
        });

        this.jobs.set('eveningShift', job);
        logger.info(`Akşam vardiya cron job kuruldu: ${cronTime} (${eveningShift.baslangic_saat})`);
    }

    /**
     * Gündüz vardiya cron job'ı
     */
    async setupMorningShiftJob(shiftTimeRanges) {
        const morningShift = shiftTimeRanges.find(shift => 
            (shift.baslangic_saat >= '06:00' && shift.baslangic_saat <= '10:00') || 
            (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('gündüz')) ||
            (shift.vardiya_adi && shift.vardiya_adi.toLowerCase().includes('sabah'))
        ) || shiftTimeRanges[0];

        if (!morningShift) return;

        const [hour, minute] = morningShift.baslangic_saat.split(':').map(Number);
        const cronTime = `${minute} ${hour} * * *`;
        
        const job = cron.schedule(cronTime, async () => {
            await this.handleShiftChange('Gündüz Vardiya', morningShift.baslangic_saat);
        }, { 
            timezone: "Europe/Istanbul",
            scheduled: false 
        });

        this.jobs.set('morningShift', job);
        logger.info(`Gündüz vardiya cron job kuruldu: ${cronTime} (${morningShift.baslangic_saat})`);
    }

    /**
     * Vardiya değişimi işleme
     */
    async handleShiftChange(shiftName, shiftTime) {
        logger.info(`[${shiftName}] Cron tetiklendi (${shiftTime}).`);
        try {
            const now = new Date();
            
            // Görevli nöbetçiyi belirle
            const { gorevliNobetci, gorevliKaynak, overrideTemizlendi, vardiya } = 
                await determineActiveGuard(this.db, this.calendarUtils.getGorevliNobetci, now);

            if (!gorevliNobetci) {
                logger.warn(`[${shiftName}] Görevli nöbetçi bulunamadı`);
                return;
            }

            // Manuel değişiklik korunması kontrolü
            const currentActive = await this.db.getAktifNobetci();
            const override = await this.db.getAktifNobetciOverride();
            
            // Eğer manuel atama varsa ve izinli değilse, manuel atamayı koru
            if (override && override.nobetci_id && gorevliKaynak === 'override') {
                logger.info(`[${shiftName}] Manuel atama korunuyor: ${gorevliNobetci.name}`);
                return;
            }

            // Aktif nöbetçiyi güncelle
            const wasUpdated = await updateActiveGuard(
                this.db, 
                gorevliNobetci, 
                gorevliKaynak, 
                overrideTemizlendi, 
                this.telegramBotHandler.notifyAllOfDutyChange
            );

            if (wasUpdated) {
                let bildirimSebebi = `${shiftName} Değişimi`;
                if (overrideTemizlendi) {
                    bildirimSebebi = `${shiftName} Değişimi (İzin Nedeniyle)`;
                } else if (gorevliKaynak === 'override') {
                    bildirimSebebi = `${shiftName} (Manuel Atama Devam)`;
                } else if (gorevliKaynak === 'yedek') {
                    bildirimSebebi = `${shiftName} Değişimi (Yedek Atama)`;
                }
                
                if (typeof this.telegramBotHandler.notifyAllOfDutyChange === 'function') {
                    await this.telegramBotHandler.notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
                }
                
                logger.info(`[${shiftName}] Vardiya değişimi tamamlandı: ${gorevliNobetci.name} (${gorevliKaynak})`);
            } else {
                logger.debug(`[${shiftName}] Vardiya değişimi gerekmedi, mevcut nöbetçi: ${currentActive?.name || 'Bilinmiyor'}`);
            }
        } catch (error) {
            logger.error(`[${shiftName}] Cron hatası:`, error);
        }
    }

    /**
     * Kaçırılan vardiya değişimlerini kontrol eder ve düzeltir
     */
    async checkMissedShiftChanges() {
        try {
            const now = new Date();
            const shiftTimeRanges = await this.db.getShiftTimeRanges();
            
            if (!shiftTimeRanges || shiftTimeRanges.length === 0) return;

            for (const shift of shiftTimeRanges) {
                const [hour, minute] = shift.baslangic_saat.split(':').map(Number);
                const shiftStartTime = new Date(now);
                shiftStartTime.setHours(hour, minute, 0, 0);
                
                // Son 10 dakika içinde başlayan vardiya var mı?
                const timeDiff = now.getTime() - shiftStartTime.getTime();
                if (timeDiff > 0 && timeDiff <= 10 * 60 * 1000) { // 10 dakika
                    logger.info(`[Kaçırılan Vardiya] ${shift.vardiya_adi || 'Vardiya'} kontrolü yapılıyor...`);
                    
                    const shiftName = shift.vardiya_adi || 
                                    (shift.baslangic_saat >= '17:00' || shift.baslangic_saat < '09:00' ? 'Gece Vardiya' : 'Gündüz Vardiya');
                    
                    await this.handleShiftChange(shiftName, shift.baslangic_saat);
                }
            }
        } catch (error) {
            logger.error('[Kaçırılan Vardiya] Kontrol hatası:', error);
        }
    }

    /**
     * Tüm cron job'ları başlat
     */
    async startAllJobs() {
        try {
            // Temel job'ları kur
            this.setupCreditUpdateJob();
            this.setupWeeklyAssignmentJob();
            
            // Vardiya job'larını kur
            await this.setupShiftChangeJobs();
            
            // Tüm job'ları başlat
            for (const [name, job] of this.jobs) {
                job.start();
                logger.info(`Cron job başlatıldı: ${name}`);
            }
            
            logger.info('Tüm cron job tanımlamaları tamamlandı ve başlatıldı.');
        } catch (error) {
            logger.error('Cron job\'ları başlatılırken hata:', error);
            throw error;
        }
    }

    /**
     * Tüm cron job'ları durdur
     */
    stopAllJobs() {
        for (const [name, job] of this.jobs) {
            job.stop();
            logger.info(`Cron job durduruldu: ${name}`);
        }
        this.jobs.clear();
    }

    /**
     * Belirli bir job'ı durdur
     */
    stopJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.stop();
            this.jobs.delete(jobName);
            logger.info(`Cron job durduruldu: ${jobName}`);
            return true;
        }
        return false;
    }

    /**
     * Aktif job'ları listele
     */
    getActiveJobs() {
        return Array.from(this.jobs.keys());
    }
}

module.exports = CronJobManager;