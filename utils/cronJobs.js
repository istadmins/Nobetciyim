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
     * Dakikalık kredi güncelleme cron job'ı
     */
    setupCreditUpdateJob() {
        const job = cron.schedule('* * * * *', async () => {
            const now = new Date();
            try {
                // Görevli nöbetçiyi belirle
                const { gorevliNobetci, gorevliKaynak, overrideTemizlendi } = 
                    await determineActiveGuard(this.db, this.calendarUtils.getGorevliNobetci, now);

                if (!gorevliNobetci) {
                    logger.warn('[Kredi Cron] Görevli nöbetçi bulunamadı');
                    return;
                }

                // Aktif nöbetçiyi güncelle
                await updateActiveGuard(
                    this.db, 
                    gorevliNobetci, 
                    gorevliKaynak, 
                    overrideTemizlendi, 
                    this.telegramBotHandler.notifyAllOfDutyChange
                );

                // Kredi hesaplama ve güncelleme
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
            const { gorevliNobetci, gorevliKaynak, overrideTemizlendi } = 
                await determineActiveGuard(this.db, this.calendarUtils.getGorevliNobetci, now);

            if (!gorevliNobetci) {
                logger.warn(`[${shiftName}] Görevli nöbetçi bulunamadı`);
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
                }
                
                if (typeof this.telegramBotHandler.notifyAllOfDutyChange === 'function') {
                    await this.telegramBotHandler.notifyAllOfDutyChange(gorevliNobetci.name, bildirimSebebi);
                }
            }
        } catch (error) {
            logger.error(`[${shiftName}] Cron hatası:`, error);
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