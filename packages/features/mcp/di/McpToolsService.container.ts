import { getBookingCancelService } from "@calcom/features/bookings/di/BookingCancelService.container";
import { getRegularBookingService } from "@calcom/features/bookings/di/RegularBookingService.container";
import { getAvailableSlotsService } from "@calcom/features/di/containers/AvailableSlots";
import { getEventTypesPublic } from "@calcom/features/eventtypes/lib/getEventTypesPublic";
import { prisma } from "@calcom/prisma";
import { PrismaMcpBookingRepository } from "../repositories/PrismaMcpBookingRepository";
import { PrismaMcpUserRepository } from "../repositories/PrismaMcpUserRepository";
import { McpToolsService } from "../services/McpToolsService";

export function getMcpToolsService(): McpToolsService {
  return new McpToolsService({
    userRepository: new PrismaMcpUserRepository(prisma),
    bookingRepository: new PrismaMcpBookingRepository(prisma),
    availableSlotsService: getAvailableSlotsService(),
    regularBookingService: getRegularBookingService(),
    bookingCancelService: getBookingCancelService(),
    getEventTypesPublic,
  });
}
