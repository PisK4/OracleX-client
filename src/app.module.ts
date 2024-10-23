import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OraclexDataCommitService } from './oracle-x-data-commit.service';
import { ScheduleModule } from '@nestjs/schedule';
import { OracleXSchedule } from './oracle-x.schedule';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ScheduleModule.forRoot(), ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService, OracleXSchedule, OraclexDataCommitService],
})
export class AppModule {}
